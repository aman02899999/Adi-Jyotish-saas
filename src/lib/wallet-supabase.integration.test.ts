import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// unstable_cache requires Next's incremental cache, which does not exist outside a
// Next runtime. Mocked so wallet.ts can read the studio currency.
vi.mock("@/lib/studio-settings", () => ({
  getStudioSettings: async () => ({
    studioName: "Adi Jyotish Guru",
    supportEmail: "support@adijyotishguru.com",
    timezone: "Asia/Kolkata",
    currency: "INR",
    cancellationHours: 24,
    bookingLeadMinutes: 15,
    replySlaHours: 24,
    gstRate: 18,
    gstin: null,
    updatedAt: new Date().toISOString(),
  }),
}));

import {
  captureHold,
  createHold,
  creditWalletBonus,
  debitWallet,
  getActiveHold,
  getAdminWalletBalances,
  getAdminWalletLedger,
  getAdminWalletSummary,
  getOrCreateWallet,
  getWalletHistory,
  InsufficientBalanceError,
  rechargeWallet,
  releaseHold,
} from "@/lib/wallet";
import { closePgPool, query } from "@/lib/postgres";

/**
 * Exercises wallet.ts end-to-end through the cutover gate against a real
 * database. Money invariants are checked against the actual rows rather than the
 * return values, so a bug in either layer shows up.
 *
 * Hold accounting follows the Firestore behaviour: createHold DEBITS the wallet
 * immediately, captureHold refunds the uncaptured remainder, releaseHold refunds
 * all of it. There is no separate hold balance column.
 *
 * Requires SUPABASE_CUTOVER=true and SUPABASE_DB_URL. Skipped otherwise.
 */
const describeWallet = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

const MEMBER_ID = "itest-wallet-member";
const MEMBER_NAME = "Wallet Test Member";

async function storedBalance(): Promise<number> {
  const { rows } = await query(`select balance from public.wallets where id = $1`, [MEMBER_ID]);
  return Number(rows[0].balance);
}

describeWallet("wallet on Postgres", () => {
  beforeAll(async () => {
    await query(`delete from public.wallet_entries where wallet_id = $1`, [MEMBER_ID]);
    await query(`delete from public.wallet_holds where wallet_id = $1`, [MEMBER_ID]);
    await query(`delete from public.wallets where id = $1`, [MEMBER_ID]);
    await query(`delete from public.members where id = $1`, [MEMBER_ID]);
    // wallets.member_id is a real foreign key to members(id).
    await query(`insert into public.members (id, name, email) values ($1, $2, $3)`, [
      MEMBER_ID,
      MEMBER_NAME,
      "wallet-itest@example.com",
    ]);
  });

  afterAll(async () => {
    await closePgPool();
  });

  it("creates the wallet from the studio currency", async () => {
    const wallet = await getOrCreateWallet(MEMBER_ID);
    expect(wallet.id).toBe(MEMBER_ID);
    expect(wallet.memberId).toBe(MEMBER_ID);
    expect(wallet.currency).toBe("INR");
    expect(wallet.balance).toBe(0);
    expect(typeof wallet.balance).toBe("number"); // numeric arrives as a string from pg
    expect(wallet.createdAt).toBeInstanceOf(Date);
    expect(wallet.updatedAt).toBeInstanceOf(Date);
  });

  it("credits a recharge and is idempotent on the payment id", async () => {
    const first = await rechargeWallet({ memberId: MEMBER_ID, amount: 1000, razorpayPaymentId: "pay_itest_recharge" });
    expect(first.balance).toBe(1000);

    // Replayed webhook.
    const second = await rechargeWallet({ memberId: MEMBER_ID, amount: 1000, razorpayPaymentId: "pay_itest_recharge" });
    expect(second.balance).toBe(1000);
    expect(await storedBalance()).toBe(1000);

    const { rows } = await query(`select count(*)::int as n from public.wallet_entries where id = $1`, ["pay_itest_recharge"]);
    expect(rows[0].n).toBe(1);
  });

  it("debits with a negative ledger amount", async () => {
    const wallet = await debitWallet({
      memberId: MEMBER_ID,
      amount: 150,
      type: "debit",
      referenceType: "booking",
      referenceId: "itest-booking-1",
    });
    expect(wallet.balance).toBe(850);
    expect(await storedBalance()).toBe(850);

    // The entry id is the idempotency key: `${referenceType}_${referenceId}`.
    const { rows } = await query(`select amount from public.wallet_entries where id = $1`, ["booking_itest-booking-1"]);
    expect(Number(rows[0].amount)).toBe(-150);
  });

  it("is idempotent on a replayed debit", async () => {
    const wallet = await debitWallet({
      memberId: MEMBER_ID,
      amount: 150,
      type: "debit",
      referenceType: "booking",
      referenceId: "itest-booking-1",
    });
    expect(wallet.balance).toBe(850);
    const { rows } = await query(`select count(*)::int as n from public.wallet_entries where id = $1`, ["booking_itest-booking-1"]);
    expect(rows[0].n).toBe(1);
  });

  it("refuses an overdraft without touching the balance", async () => {
    await expect(
      debitWallet({ memberId: MEMBER_ID, amount: 100000, type: "debit", referenceType: "booking", referenceId: "itest-overdraft" }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect(await storedBalance()).toBe(850);
  });

  it("applies a bonus credit keyed on the reference id", async () => {
    const wallet = await creditWalletBonus({
      memberId: MEMBER_ID,
      amount: 50,
      type: "bonus",
      referenceType: "referral",
      referenceId: "itest-referral",
    });
    expect(wallet.balance).toBe(900);
    const { rows } = await query(`select amount from public.wallet_entries where id = $1`, ["itest-referral"]);
    expect(Number(rows[0].amount)).toBe(50);
  });

  it("debits on hold, then refunds the uncaptured part on capture", async () => {
    const hold = await createHold({ memberId: MEMBER_ID, amount: 200, referenceType: "booking" });
    expect(hold.status).toBe("active");
    expect(hold.walletId).toBe(MEMBER_ID);
    expect(hold.amount).toBe(200);
    expect(typeof hold.amount).toBe("number");
    // The full hold leaves the available balance immediately.
    expect(await storedBalance()).toBe(700);

    const captured = await captureHold({ memberId: MEMBER_ID, holdId: hold.id, capturedAmount: 80, referenceType: "booking" });
    expect(captured.status).toBe("captured");
    // 80 was spent, so 120 comes back.
    expect(await storedBalance()).toBe(820);

    const { rows } = await query(
      `select amount from public.wallet_entries where reference_id = $1 and type = $2`,
      [hold.id, "release"],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(120);
  });

  it("refunds the whole hold on release", async () => {
    const hold = await createHold({ memberId: MEMBER_ID, amount: 100, referenceType: "booking" });
    expect(await storedBalance()).toBe(720);

    const released = await releaseHold({ memberId: MEMBER_ID, holdId: hold.id, referenceType: "booking" });
    expect(released.status).toBe("released");
    expect(await storedBalance()).toBe(820);
  });

  it("treats a second settlement of the same hold as a no-op", async () => {
    const hold = await createHold({ memberId: MEMBER_ID, amount: 50, referenceType: "booking" });
    await releaseHold({ memberId: MEMBER_ID, holdId: hold.id, referenceType: "booking" });
    expect(await storedBalance()).toBe(820);

    // Mirrors the Firestore path, which returns the settled hold instead of throwing.
    const again = await captureHold({ memberId: MEMBER_ID, holdId: hold.id, capturedAmount: 50, referenceType: "booking" });
    expect(again.status).toBe("released");
    expect(await storedBalance()).toBe(820);
  });

  it("returns null for an unknown hold", async () => {
    await expect(getActiveHold(MEMBER_ID, "no-such-hold")).resolves.toBeNull();
  });

  it("serialises concurrent debits so money is not lost", async () => {
    const before = await storedBalance(); // 820
    const each = 100;
    const attempts = 20;

    // Twenty simultaneous debits of 100 against 820: at most eight can be
    // honoured. Without the `for update` row lock several transactions read the
    // same 820 and each writes back its own stale result, so more than eight
    // "succeed" while the balance only reflects one of them.
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, i) =>
        debitWallet({ memberId: MEMBER_ID, amount: each, type: "debit", referenceType: "booking", referenceId: `itest-race-${i}` }),
      ),
    );

    const won = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    for (const r of rejected) expect(r.reason).toBeInstanceOf(InsufficientBalanceError);
    expect(won).toBeLessThanOrEqual(Math.floor(before / each));
    expect(won).toBeGreaterThan(1); // prove the test really ran a race, not a queue

    const after = await storedBalance();
    // The invariant a lost update breaks: the balance must equal the starting
    // balance minus exactly what the successful debits took.
    expect(after).toBe(before - each * won);

    // And the ledger must still sum to the balance.
    const { rows } = await query(`select coalesce(sum(amount), 0)::numeric as s from public.wallet_entries where wallet_id = $1`, [
      MEMBER_ID,
    ]);
    expect(Number(rows[0].s)).toBe(after);
  });

  it("returns history newest-first with coerced numerics", async () => {
    const history = await getWalletHistory(MEMBER_ID);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].walletId).toBe(MEMBER_ID);
    expect(history[0].amount).toBeTypeOf("number");
    expect(history[0].balanceAfter).toBeTypeOf("number");
    expect(history[0].createdAt).toBeInstanceOf(Date);
    const times = history.map((e) => e.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("serves the admin views with the member join", async () => {
    // These three helpers aggregate over the WHOLE database, so they cannot be
    // asserted against absolute counts: every other integration file that credits a
    // wallet (referrals, ai-readings) adds a row, and vitest runs files in parallel.
    // The old version demanded walletCount === 1 and that all five newest ledger
    // entries belonged to this member, which only ever held on an otherwise empty
    // database. What is actually being tested is that the aggregates include this
    // member and that the members join resolves, so that is what is asserted.
    const expected = await storedBalance();
    const summary = await getAdminWalletSummary();
    expect(summary.walletCount).toBeGreaterThanOrEqual(1);
    expect(summary.totalBalance).toBeGreaterThanOrEqual(expected);

    const balances = await getAdminWalletBalances();
    const ours = balances.find((row) => row.memberName === MEMBER_NAME);
    expect(ours).toBeDefined();
    expect(ours?.balance).toBe(expected);

    // Ask for more than this member has so the slice cannot starve the filter.
    const ledger = await getAdminWalletLedger(500);
    // Proves the members join resolved rather than yielding empty names.
    for (const row of ledger) {
      expect(row.memberName).toBeTruthy();
      expect(row.amount).toBeTypeOf("number");
    }
    const ourEntries = ledger.filter((row) => row.memberName === MEMBER_NAME);
    expect(ourEntries.length).toBeGreaterThan(0);
    const times = ourEntries.map((row) => row.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});
