import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import {
  activateSubscriptionInSupabase,
  cancelSubscriptionInSupabase,
  claimSubscriptionCheckoutInSupabase,
  getMemberSubscriptionInSupabase,
  recordSubscriptionCheckoutInSupabase,
  recordSubscriptionInvoiceInSupabase,
  releaseSubscriptionCheckoutInSupabase,
  syncMemberPlanLabelInSupabase,
} from "@/lib/subscriptions-supabase";

/**
 * The subscription *write* path on Postgres. Skipped unless SUPABASE_DB_URL points at a database
 * carrying the migration schema.
 *
 * These exist because only the reads were ported at first. Under cutover that meant
 * startSubscriptionCheckout wrote Firestore while verifySubscriptionCheckout read Postgres: the
 * member was charged by Razorpay and then told "No matching subscription attempt was found",
 * and the renewal webhook — which resolves by razorpay_subscription_id in Postgres — never
 * matched either. Every assertion below is on a row actually in the database, because a mock
 * cannot tell a write that landed from one that went to the other store.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const MEMBER_ID = "member-subwrite-itest";
const PLAN_ID = "plan-subwrite-itest";
const ACTIVE = ["active", "authenticated", "pending"] as const;
const TTL_MS = 10 * 60 * 1000;

async function reset() {
  await query(`delete from public.subscription_invoices where member_id = $1`, [MEMBER_ID]);
  await query(`delete from public.member_subscriptions where id = $1`, [MEMBER_ID]);
  await query(`delete from public.members where id = $1`, [MEMBER_ID]);
  await query(`delete from public.membership_plans where id = $1`, [PLAN_ID]);
  await query(
    `insert into public.members (id, name, email, plan) values ($1, 'Sub Write', $2, 'free')`,
    [MEMBER_ID, `${MEMBER_ID}@example.test`],
  );
  await query(
    `insert into public.membership_plans (id, key, name, tagline, description, price_monthly,
       price_yearly, currency, features, session_discount_percent, highlighted, active, sort_order,
       razorpay_plan_id_monthly, razorpay_plan_id_yearly, created_at, updated_at)
     values ($1, 'subwrite', 'Sub Write', '', '', 499, 4990, 'INR', '[]'::jsonb, 0, false, true, 99,
             null, null, now(), now())`,
    [PLAN_ID],
  );
}

async function statusOf(): Promise<string | null> {
  const row = await getMemberSubscriptionInSupabase(MEMBER_ID);
  return row?.status ?? null;
}

describeDb("subscription writes on Postgres", () => {
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await closePgPool();
  });

  it("claims a slot for a member with no subscription at all", async () => {
    const claim = await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    expect(claim).toEqual({ previousStatus: null, razorpayCustomerId: null, hadRow: false });
    expect(await statusOf()).toBe("pending_checkout");
  });

  it("refuses a second claim while the first is live", async () => {
    await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    // Without this the member ends up with two real Razorpay subscriptions, one of them orphaned
    // and still charging their card with no record of it anywhere in the app.
    await expect(claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS))
      .rejects.toThrow(/already have a membership in progress/);
  });

  it("refuses a claim over an active membership", async () => {
    await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    await activateSubscriptionInSupabase({
      memberId: MEMBER_ID, status: "active", currentPeriodStart: new Date(), currentPeriodEnd: null,
    });
    await expect(claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS))
      .rejects.toThrow(/already have a membership in progress/);
  });

  it("lets a stale claim be retaken, so an abandoned checkout does not lock the member out", async () => {
    await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    await query(
      `update public.member_subscriptions set updated_at = now() - interval '2 hours' where id = $1`,
      [MEMBER_ID],
    );
    const retaken = await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    expect(retaken.previousStatus).toBe("pending_checkout");
    expect(await statusOf()).toBe("pending_checkout");
  });

  it("allows a claim after a cancellation", async () => {
    await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    await cancelSubscriptionInSupabase({
      memberId: MEMBER_ID, status: "cancelled", cancelAtPeriodEnd: false, cancelledAt: new Date(),
    });
    const claim = await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    expect(claim).toEqual({ previousStatus: "cancelled", razorpayCustomerId: null, hadRow: true });
  });

  it("releases the claim back to its previous status when Razorpay fails", async () => {
    await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    await cancelSubscriptionInSupabase({
      memberId: MEMBER_ID, status: "cancelled", cancelAtPeriodEnd: false, cancelledAt: new Date(),
    });
    const claim = await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);

    await releaseSubscriptionCheckoutInSupabase(MEMBER_ID, claim.previousStatus);
    expect(await statusOf()).toBe("cancelled");
    // And the slot is immediately reusable rather than stranded for the full TTL.
    await expect(claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS)).resolves.toBeTruthy();
  });

  it("records the Razorpay subscription against the claimed row", async () => {
    await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    await recordSubscriptionCheckoutInSupabase({
      memberId: MEMBER_ID, planId: PLAN_ID, billingInterval: "yearly",
      status: "created", razorpaySubscriptionId: "sub_ABC123",
    });

    const row = await getMemberSubscriptionInSupabase(MEMBER_ID);
    // razorpaySubscriptionId is how the renewal webhook finds this row. Leaving it null is how
    // renewals silently stopped being recorded.
    expect(row).toMatchObject({
      planId: PLAN_ID, billingInterval: "yearly", status: "created", razorpaySubscriptionId: "sub_ABC123",
    });
  });

  it("clears a prior cancellation when the member resubscribes", async () => {
    await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    await cancelSubscriptionInSupabase({
      memberId: MEMBER_ID, status: "cancelled", cancelAtPeriodEnd: true, cancelledAt: new Date(),
    });
    await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    await recordSubscriptionCheckoutInSupabase({
      memberId: MEMBER_ID, planId: PLAN_ID, billingInterval: "monthly",
      status: "created", razorpaySubscriptionId: "sub_NEW",
    });

    const row = await getMemberSubscriptionInSupabase(MEMBER_ID);
    expect(row?.cancelAtPeriodEnd).toBe(false);
    expect(row?.cancelledAt).toBeNull();
  });

  it("activates the subscription with the billing period from Razorpay", async () => {
    await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-02-01T00:00:00Z");
    await activateSubscriptionInSupabase({
      memberId: MEMBER_ID, status: "active", currentPeriodStart: start, currentPeriodEnd: end,
    });

    const row = await getMemberSubscriptionInSupabase(MEMBER_ID);
    expect(row?.status).toBe("active");
    expect(row?.currentPeriodStart?.toISOString()).toBe(start.toISOString());
    expect(row?.currentPeriodEnd?.toISOString()).toBe(end.toISOString());
  });

  it("applies a cancel-at-period-end without clearing the period", async () => {
    await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    const end = new Date("2026-02-01T00:00:00Z");
    await activateSubscriptionInSupabase({
      memberId: MEMBER_ID, status: "active", currentPeriodStart: new Date(), currentPeriodEnd: end,
    });
    await cancelSubscriptionInSupabase({
      memberId: MEMBER_ID, status: "active", cancelAtPeriodEnd: true, cancelledAt: null,
    });

    const row = await getMemberSubscriptionInSupabase(MEMBER_ID);
    // The member keeps what they paid for until the period ends.
    expect(row).toMatchObject({ status: "active", cancelAtPeriodEnd: true, cancelledAt: null });
    expect(row?.currentPeriodEnd?.toISOString()).toBe(end.toISOString());
  });

  it("keeps members.plan in step with the subscription", async () => {
    await syncMemberPlanLabelInSupabase(MEMBER_ID, "premium");
    const after = await query<{ plan: string }>(`select plan from public.members where id = $1`, [MEMBER_ID]);
    expect(after.rows[0].plan).toBe("premium");
  });

  describe("invoice idempotency", () => {
    const invoice = (id: string, paymentId: string) => ({
      id, subscriptionId: MEMBER_ID, memberId: MEMBER_ID,
      amount: 4990, subtotal: 4228.81, taxAmount: 761.19, taxRate: 18, currency: "INR",
      razorpayPaymentId: paymentId,
      periodStart: new Date("2026-01-01T00:00:00Z"), periodEnd: new Date("2027-01-01T00:00:00Z"),
    });

    beforeEach(async () => {
      await claimSubscriptionCheckoutInSupabase(MEMBER_ID, PLAN_ID, ACTIVE, TTL_MS);
    });

    it("records a paid invoice", async () => {
      expect(await recordSubscriptionInvoiceInSupabase(invoice("pay_1", "pay_1"))).toBe(true);
      const rows = await query(`select status, amount from public.subscription_invoices where member_id = $1`, [MEMBER_ID]);
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].status).toBe("paid");
    });

    it("records one invoice for a retried payment, not two", async () => {
      await recordSubscriptionInvoiceInSupabase(invoice("pay_2", "pay_2"));
      // A retried verify call (double submit, a client retrying on timeout) must not bill the
      // member twice on the ledger. Same id: caught by the primary key.
      expect(await recordSubscriptionInvoiceInSupabase(invoice("pay_2", "pay_2"))).toBe(false);
      const rows = await query(`select 1 from public.subscription_invoices where member_id = $1`, [MEMBER_ID]);
      expect(rows.rowCount).toBe(1);
    });

    it("refuses a second invoice for the same payment under a different id", async () => {
      await recordSubscriptionInvoiceInSupabase(invoice("inv_a", "pay_3"));
      // Different primary key, same payment. Only the unique index on razorpay_payment_id
      // (migration 0012) catches this one — the pk does not.
      expect(await recordSubscriptionInvoiceInSupabase(invoice("inv_b", "pay_3"))).toBe(false);
      const rows = await query(`select 1 from public.subscription_invoices where member_id = $1`, [MEMBER_ID]);
      expect(rows.rowCount).toBe(1);
    });

    it("still allows distinct payments", async () => {
      await recordSubscriptionInvoiceInSupabase(invoice("pay_4", "pay_4"));
      expect(await recordSubscriptionInvoiceInSupabase(invoice("pay_5", "pay_5"))).toBe(true);
      const rows = await query(`select 1 from public.subscription_invoices where member_id = $1`, [MEMBER_ID]);
      expect(rows.rowCount).toBe(2);
    });
  });
});
