import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import {
  createPayoutRequestInSupabase,
  getPayoutLedgerInSupabase,
  getPractitionerPayoutsInSupabase,
} from "@/lib/practitioner-payouts-supabase";

// requestPayout notifies admins when it auto-approves, and those two modules still
// read Firestore. Mocked so this test exercises the payout path only.
vi.mock("@/lib/admin-roles", () => ({ getAdminIdsWithPermission: async () => [] }));
vi.mock("@/lib/notifications", () => ({ notifyAdmins: async () => undefined }));

import { PayoutError, getPractitionerPayouts, requestPayout, updatePayoutStatus } from "@/lib/practitioner-portal";

/**
 * Integration coverage for the payout money path. Skipped unless SUPABASE_DB_URL
 * points at a reachable database carrying the migration schema, and the gated
 * tests additionally need SUPABASE_CUTOVER=true.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/practitioner-payouts-supabase.integration.test.ts
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const MEMBER_ID = "member-payout-itest";
const SERVICE_ID = "svc-payout-itest";
const PRACTITIONER_ID = "prac-payout-itest";
const DEMO_ID = "prac-payout-demo";

// Two paid bookings at ₹1000 plus one ended chat session that captured ₹500.
// The cancelled booking and the unpaid one must not count.
const TOTAL_EARNED = 2500;

async function cleanup() {
  await query(`delete from public.practitioner_payouts where practitioner_id in ($1, $2)`, [PRACTITIONER_ID, DEMO_ID]);
  await query(`delete from public.bookings where practitioner_id in ($1, $2)`, [PRACTITIONER_ID, DEMO_ID]);
  await query(`delete from public.chat_sessions where practitioner_id in ($1, $2)`, [PRACTITIONER_ID, DEMO_ID]);
  await query(`delete from public.practitioners where id in ($1, $2)`, [PRACTITIONER_ID, DEMO_ID]);
  await query(`delete from public.services where id = $1`, [SERVICE_ID]);
  await query(`delete from public.members where id = $1`, [MEMBER_ID]);
}

async function seed() {
  await cleanup();
  await query(`insert into public.members (id, name, email) values ($1, $2, $3)`, [MEMBER_ID, "Payout Member", "member-payout-itest@example.test"]);
  await query(`insert into public.services (id, title, slug) values ($1, $2, $3)`, [SERVICE_ID, "Payout Consultation", "payout-consultation"]);
  for (const id of [PRACTITIONER_ID, DEMO_ID]) {
    await query(
      `insert into public.practitioners (id, name, slug, email, active, is_demo_account, chat_rate_per_minute)
       values ($1, $2, $3, $4, true, $5, 100)`,
      [id, `Payout ${id.slice(-4)}`, `payout-${id}`, `${id}@example.test`, id === DEMO_ID],
    );
  }

  const booking = (id: string, price: number, status: string, paymentStatus: string) =>
    query(
      `insert into public.bookings
         (id, reference, service_id, service_title, practitioner_id, practitioner_name,
          member_id, client_name, client_email, scheduled_at, service_price, status, payment_status)
       values ($1, $2, $3, 'Payout Consultation', $4, 'Payout Prac', $5, 'Payout Member',
               'member-payout-itest@example.test', now(), $6, $7, $8)`,
      [id, `REF-${id}`, SERVICE_ID, PRACTITIONER_ID, MEMBER_ID, price, status, paymentStatus],
    );

  await Promise.all([
    booking("bk-pay-1", 1000, "completed", "paid"),
    booking("bk-pay-2", 1000, "completed", "paid"),
    booking("bk-pay-cancelled", 5000, "cancelled", "paid"),
    booking("bk-pay-unpaid", 5000, "completed", "unpaid"),
    query(
      `insert into public.chat_sessions (id, member_id, practitioner_id, status, captured_amount)
       values ('chat-pay-1', $1, $2, 'ended', 500)`,
      [MEMBER_ID, PRACTITIONER_ID],
    ),
  ]);
}

/** Inserts a payout directly, to set up the "clean history" auto-approve cases. */
async function seedPayout(id: string, amount: number, status: string) {
  await query(
    `insert into public.practitioner_payouts (id, practitioner_id, amount, currency, status, payout_method, requested_at)
     values ($1, $2, $3, 'INR', $4, 'bank_transfer', now())`,
    [id, PRACTITIONER_ID, amount, status],
  );
}

describeCutover("the payout ledger on Postgres", () => {
  beforeEach(async () => {
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("counts paid non-cancelled bookings and ended chat sessions, as numbers", async () => {
    const ledger = await getPayoutLedgerInSupabase(PRACTITIONER_ID);
    // numeric sums arrive as strings; the twin converts them. Against a string the
    // balance subtraction below would concatenate instead of subtracting.
    expect(typeof ledger.totalEarned).toBe("number");
    expect(ledger.totalEarned).toBe(TOTAL_EARNED);
    expect(ledger.paidOut).toBe(0);
    expect(ledger.pendingOut).toBe(0);
    expect(ledger.hasPriorPaid).toBe(false);
  });

  it("tracks paid and pending payouts separately", async () => {
    await seedPayout("pay-ledger-paid", 400, "paid");
    await seedPayout("pay-ledger-pending", 300, "requested");
    const ledger = await getPayoutLedgerInSupabase(PRACTITIONER_ID);
    expect(ledger.paidOut).toBe(400);
    expect(ledger.pendingOut).toBe(300);
    expect(ledger.hasPriorPaid).toBe(true);
  });

  it("returns the practitioner's payouts newest first with numeric amounts", async () => {
    await seedPayout("pay-list-1", 100, "requested");
    const payouts = await getPractitionerPayouts(PRACTITIONER_ID);
    expect(payouts).toHaveLength(1);
    expect(typeof payouts[0]?.amount).toBe("number");
    expect(payouts[0]?.requestedAt).toBeInstanceOf(Date);
    // Also proves the gated read is the one answering.
    expect((await getPractitionerPayoutsInSupabase(PRACTITIONER_ID))[0]?.id).toBe("pay-list-1");
  });
});

describeCutover("requestPayout under cutover", () => {
  beforeEach(async () => {
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("refuses a demo account", async () => {
    await expect(requestPayout(DEMO_ID, 500)).rejects.toBeInstanceOf(PayoutError);
  });

  it("refuses an amount below the ₹100 floor", async () => {
    await expect(requestPayout(PRACTITIONER_ID, 50)).rejects.toThrow(/at least/);
  });

  it("refuses more than the available balance", async () => {
    await expect(requestPayout(PRACTITIONER_ID, TOTAL_EARNED + 1)).rejects.toThrow(/You can request up to/);
    expect(await getPractitionerPayouts(PRACTITIONER_ID)).toHaveLength(0);
  });

  it("queues a first request rather than auto-approving it", async () => {
    const payout = await requestPayout(PRACTITIONER_ID, 2000);
    // No prior paid payout yet, so the clean-history condition is not met.
    expect(payout.status).toBe("requested");
    expect(payout.processedBy).toBeNull();
    expect(payout.amount).toBe(2000);
  });

  it("auto-approves a small request from a practitioner with a clean paid history", async () => {
    await seedPayout("pay-history-paid", 400, "paid");
    const payout = await requestPayout(PRACTITIONER_ID, 1000);
    expect(payout.status).toBe("approved");
    expect(payout.processedBy).toBe("system:auto-approval");
    expect(payout.processedAt).toBeInstanceOf(Date);
  });

  it("withholds auto-approval once there has ever been a rejection", async () => {
    await seedPayout("pay-history-paid", 400, "paid");
    await seedPayout("pay-history-rejected", 200, "rejected");
    const payout = await requestPayout(PRACTITIONER_ID, 1000);
    expect(payout.status).toBe("requested");
  });

  it("counts pending requests against the balance", async () => {
    await seedPayout("pay-pending", 2000, "requested");
    // 2500 earned - 2000 pending leaves 500.
    await expect(requestPayout(PRACTITIONER_ID, 600)).rejects.toThrow(/up to ₹500/);
    await expect(requestPayout(PRACTITIONER_ID, 500)).resolves.toMatchObject({ status: "requested" });
  });

  it("does not let concurrent requests together exceed the balance", async () => {
    // Ten simultaneous ₹500 requests against ₹2500 earned, so exactly five can be
    // honoured. This is the assertion that only holds because of the row lock:
    // without it several requests read the same stale pendingOut and each passes
    // the balance check, and the total sails past what was earned. Measured, not
    // assumed — with the lock removed this same shape let ₹4000 through against
    // ₹3000 earned.
    //
    // Ten requests rather than five also matters: at lower concurrency the
    // requests happen to serialise on their own and the race never shows up, which
    // is how the first version of this test passed against unlocked code.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => requestPayout(PRACTITIONER_ID, 500)),
    );
    const succeeded = results.filter((result) => result.status === "fulfilled");
    const payouts = await getPractitionerPayouts(PRACTITIONER_ID);
    const requested = payouts.reduce((sum, payout) => sum + payout.amount, 0);

    // The invariant is the point: never pay out more than was earned.
    expect(requested).toBeLessThanOrEqual(TOTAL_EARNED);
    expect(requested).toBe(TOTAL_EARNED);
    expect(succeeded).toHaveLength(TOTAL_EARNED / 500);
    expect(payouts).toHaveLength(TOTAL_EARNED / 500);
  });

  it("serialises two overlapping requests on the practitioner row lock", async () => {
    // The test above passes even against unlocked code: at this concurrency the
    // requests serialise on pool contention by accident, which is exactly how the
    // race hides. This one forces real overlap instead of hoping for it.
    //
    // `decide` runs inside the transaction, after the lock is taken, and is made
    // to wait. Two requests for the full remaining balance are fired together:
    //   - locked:  the second cannot enter until the first commits, so it sees the
    //              first request as pending and is refused;
    //   - unlocked: both enter, both read pendingOut = 0, both insert, and ₹1000 is
    //              promised against ₹500 earned.
    // The delay makes the unlocked interleaving certain rather than probabilistic,
    // and cannot deadlock the locked path because the second request blocks on the
    // lock before `decide` is ever reached.
    const ledgerBefore = await getPayoutLedgerInSupabase(PRACTITIONER_ID);
    const available = ledgerBefore.totalEarned - ledgerBefore.paidOut - ledgerBefore.pendingOut;
    expect(available).toBe(TOTAL_EARNED);

    const request = () =>
      createPayoutRequestInSupabase({
        practitionerId: PRACTITIONER_ID,
        amount: TOTAL_EARNED,
        notes: null,
        decide: async ({ paidOut, pendingOut }) => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          const availableBalance = Math.max(0, available - paidOut - pendingOut);
          if (TOTAL_EARNED > availableBalance) throw new PayoutError("insufficient balance");
          return { status: "requested", adminNotes: null, processedBy: null, autoApproved: false };
        },
      });

    const results = await Promise.allSettled([request(), request()]);
    const succeeded = results.filter((result) => result.status === "fulfilled");
    const payouts = await getPractitionerPayouts(PRACTITIONER_ID);
    const requested = payouts.reduce((sum, payout) => sum + payout.amount, 0);

    expect(succeeded).toHaveLength(1);
    expect(requested).toBe(TOTAL_EARNED);
    expect(requested).toBeLessThanOrEqual(TOTAL_EARNED);

    await query(`delete from public.practitioner_payouts where practitioner_id = $1`, [PRACTITIONER_ID]);
  });
});

describeCutover("updatePayoutStatus transitions under cutover", () => {
  beforeEach(async () => {
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("allows requested → approved", async () => {
    await seedPayout("pay-tr-1", 1000, "requested");
    const updated = await updatePayoutStatus("pay-tr-1", "approved", "admin-1", "Looks fine");
    expect(updated.status).toBe("approved");
    expect(updated.processedBy).toBe("admin-1");
    expect(updated.adminNotes).toBe("Looks fine");
    expect(updated.processedAt).toBeInstanceOf(Date);
  });

  it("refuses to mark a payout paid without a transaction reference", async () => {
    await seedPayout("pay-tr-2", 1000, "approved");
    await expect(updatePayoutStatus("pay-tr-2", "paid", "admin-1")).rejects.toThrow(/transaction reference/);
  });

  it("treats paid as terminal", async () => {
    await seedPayout("pay-tr-3", 1000, "approved");
    await updatePayoutStatus("pay-tr-3", "paid", "admin-1", undefined, "TXN123");
    await expect(updatePayoutStatus("pay-tr-3", "rejected", "admin-1")).rejects.toThrow(/can't be changed/);
  });

  it("lets a rejection be reconsidered to approved, but not straight to paid", async () => {
    await seedPayout("pay-tr-4", 1000, "rejected");
    await expect(updatePayoutStatus("pay-tr-4", "paid", "admin-1", undefined, "TXN")).rejects.toThrow(/can't be changed/);
    await expect(updatePayoutStatus("pay-tr-4", "approved", "admin-1")).resolves.toMatchObject({ status: "approved" });
  });

  it("reports a missing payout", async () => {
    await expect(updatePayoutStatus("no-such-payout", "approved", "admin-1")).rejects.toThrow(/not found/);
  });
});
