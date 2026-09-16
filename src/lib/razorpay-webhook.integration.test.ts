import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import {
  applySubscriptionChargeInSupabase,
  applySubscriptionStatusInSupabase,
  bumpPaymentFailureCounterInSupabase,
  claimRazorpayEventInSupabase,
  findSubscriptionByRazorpayIdInSupabase,
  getDunningStateInSupabase,
  getMemberContactInSupabase,
  getPaymentByOrderIdInSupabase,
  getRefundablePaymentInSupabase,
  insertSubscriptionInvoiceIfAbsentInSupabase,
  markDunningNoticeSentInSupabase,
  markPaymentFailedInSupabase,
  releaseRazorpayEventInSupabase,
  syncMemberPlanLabelInSupabase,
} from "@/lib/razorpay-webhook-supabase";

/**
 * Integration tests for the Razorpay webhook's data access. Skipped unless
 * SUPABASE_DB_URL points at a reachable database.
 *
 * The webhook is the one surface that writes money with nobody signed in, and
 * Razorpay retries every delivery until it gets a 2xx. So the properties that
 * matter here are the ones about repeats: a claimed event stays claimed, a
 * refund only settles a payment that is still awaiting settlement, a failure
 * event cannot overwrite a payment that succeeded, and a replayed charge does
 * not raise a second invoice.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "rzw_itest_";
const MEMBER = `${P}member`;
const PLAN = `${P}plan`;
// member_subscriptions.id IS the member id — that is how the Firestore document was
// keyed — so the two are the same value here rather than two separate fixtures.
const SUB = MEMBER;

const cleanup = async () => {
  // Children first: subscription_invoices and payments point at the rows below.
  await query(`delete from public.subscription_invoices where id like 'rzw\\_itest\\_%'`);
  await query(`delete from public.payment_failure_counters where id like 'rzw\\_itest\\_%'`);
  await query(`delete from public.razorpay_events where id like 'rzw\\_itest\\_%'`);
  await query(`delete from public.payments where id like 'rzw\\_itest\\_%'`);
  await query(`delete from public.invoices where id like 'rzw\\_itest\\_%'`);
  await query(`delete from public.member_subscriptions where id like 'rzw\\_itest\\_%'`);
  await query(`delete from public.members where id like 'rzw\\_itest\\_%'`);
  await query(`delete from public.membership_plans where id like 'rzw\\_itest\\_%'`);
};

describeDb("razorpay webhook data access (live database)", () => {
  beforeAll(async () => {
    await cleanup();
    await query(`insert into public.members (id, name, email, plan) values ($1, 'Webhook member', $2, 'free')`, [MEMBER, `${MEMBER}@example.test`]);
    await query(`insert into public.membership_plans (id, key, name, price_monthly, sort_order) values ($1, 'rzwtest', 'Webhook plan', 500, 0)`, [PLAN]);
    await query(
      `insert into public.member_subscriptions
         (id, member_id, plan_id, billing_interval, status, razorpay_subscription_id, renewal_reminder_sent_at)
       values ($1, $1, $2, 'monthly', 'active', $3, now() - interval '2 days')`,
      [SUB, PLAN, `${P}rzsub`],
    );
    // payments.invoice_id and payments.booking_id are foreign keys, so the invoice has
    // to be a real row; the booking is left null because nothing here needs it.
    await query(`insert into public.invoices (id, number, status) values ($1, $1, 'sent')`, [`${P}inv1`]);
    await query(
      `insert into public.payments (id, invoice_id, booking_id, status, provider_session_id, amount)
       values ($1, $2, null, 'pending', $3, 1000)`,
      [`${P}pay1`, `${P}inv1`, `${P}order1`],
    );
    await query(
      `insert into public.payments (id, status, payment_intent_id, amount)
       values ($1, 'refund_pending', $2, 1000)`,
      [`${P}pay2`, `${P}intent2`],
    );
    await query(
      `insert into public.payments (id, status, payment_intent_id, amount)
       values ($1, 'succeeded', $2, 1000)`,
      [`${P}pay3`, `${P}intent3`],
    );
  });

  afterAll(cleanup);

  it("claims an event once, and releases it so a retry can be processed", async () => {
    expect(await claimRazorpayEventInSupabase(`${P}evt1`, "payment.captured")).toBe(true);
    // Razorpay retried the same delivery — the handler must not run twice.
    expect(await claimRazorpayEventInSupabase(`${P}evt1`, "payment.captured")).toBe(false);

    // A handler that threw has to give the claim back, or the retry is swallowed.
    await releaseRazorpayEventInSupabase(`${P}evt1`);
    expect(await claimRazorpayEventInSupabase(`${P}evt1`, "payment.captured")).toBe(true);

    // Releasing something never claimed is a no-op, not an error.
    await releaseRazorpayEventInSupabase(`${P}never`);
  });

  it("finds a payment by its Razorpay order id", async () => {
    const row = await getPaymentByOrderIdInSupabase(`${P}order1`);
    expect(row).toMatchObject({ id: `${P}pay1`, invoiceId: `${P}inv1`, bookingId: null, status: "pending" });
    expect(await getPaymentByOrderIdInSupabase(`${P}nope`)).toBeNull();
  });

  it("only returns a payment that is still awaiting refund settlement", async () => {
    expect(await getRefundablePaymentInSupabase(`${P}intent2`)).toMatchObject({ id: `${P}pay2`, status: "refund_pending" });
    // Already refunded or never pending — a replayed refund.processed must find nothing,
    // or it would run the refund transition a second time.
    expect(await getRefundablePaymentInSupabase(`${P}intent3`)).toBeNull();
    expect(await getRefundablePaymentInSupabase(`${P}nope`)).toBeNull();
  });

  it("marks a pending payment failed but leaves a settled one alone", async () => {
    expect(await markPaymentFailedInSupabase(`${P}pay3`)).toBe(false);
    const { rows } = await query<{ status: string }>(`select status from public.payments where id = $1`, [`${P}pay3`]);
    expect(rows[0].status).toBe("succeeded");

    expect(await markPaymentFailedInSupabase(`${P}pay1`)).toBe(true);
    // Second failure event for the same payment is now a no-op.
    expect(await markPaymentFailedInSupabase(`${P}pay1`)).toBe(false);
  });

  it("counts payment failures inside a 24 hour window and restarts after it", async () => {
    expect(await bumpPaymentFailureCounterInSupabase(MEMBER)).toBe(1);
    expect(await bumpPaymentFailureCounterInSupabase(MEMBER)).toBe(2);
    expect(await bumpPaymentFailureCounterInSupabase(MEMBER)).toBe(3);
    expect(await bumpPaymentFailureCounterInSupabase(MEMBER)).toBe(4);

    // Outside the window the counter restarts rather than growing forever.
    await query(`update public.payment_failure_counters set window_start = now() - interval '25 hours' where id = $1`, [MEMBER]);
    expect(await bumpPaymentFailureCounterInSupabase(MEMBER)).toBe(1);

    // Inside it, it keeps counting from the fresh window.
    expect(await bumpPaymentFailureCounterInSupabase(MEMBER)).toBe(2);
  });

  it("returns member contact details, and null for a member who is gone", async () => {
    expect(await getMemberContactInSupabase(MEMBER)).toEqual({ name: "Webhook member", email: `${MEMBER}@example.test` });
    expect(await getMemberContactInSupabase(`${P}ghost`)).toBeNull();
  });

  it("tracks the dunning notice against the subscription", async () => {
    const before = await getDunningStateInSupabase(SUB);
    expect(before).toMatchObject({ name: "Webhook member", email: `${MEMBER}@example.test`, dunningNoticeSentAt: null });

    await markDunningNoticeSentInSupabase(SUB);
    const after = await getDunningStateInSupabase(SUB);
    expect(after?.dunningNoticeSentAt).toBeInstanceOf(Date);

    // No subscription row means there is nothing to dun.
    expect(await getDunningStateInSupabase(`${P}ghost`)).toBeNull();
  });

  it("resolves a subscription from its Razorpay id", async () => {
    const found = await findSubscriptionByRazorpayIdInSupabase(`${P}rzsub`);
    expect(found).toMatchObject({
      memberId: SUB, planId: PLAN, billingInterval: "monthly", status: "active",
    });
    expect(found?.currentPeriodStart).toBeNull();
    expect(await findSubscriptionByRazorpayIdInSupabase(`${P}nope`)).toBeNull();
  });

  it("reactivates a dunned subscription, records the period and clears the reminder", async () => {
    // Start from the state that actually matters: a subscription Razorpay halted
    // after failed retries. Seeding it already-active would make the reactivation
    // impossible to observe.
    await query(`update public.member_subscriptions set status = 'halted' where id = $1`, [SUB]);
    const start = new Date(Date.UTC(2030, 5, 1));
    const end = new Date(Date.UTC(2030, 6, 1));
    await applySubscriptionChargeInSupabase({ memberId: SUB, periodStart: start, periodEnd: end });

    const { rows } = await query<{ status: string; renewal_reminder_sent_at: Date | null; current_period_end: Date }>(
      `select status, renewal_reminder_sent_at, current_period_end from public.member_subscriptions where id = $1`,
      [SUB],
    );
    expect(rows[0].status).toBe("active");
    // The reminder for the period that just ended must be able to fire again.
    expect(rows[0].renewal_reminder_sent_at).toBeNull();
    expect(rows[0].current_period_end.toISOString()).toBe(end.toISOString());
  });

  it("writes exactly the transition it is given", async () => {
    // The writer is deliberately dumb: the "an event that omits a boundary must not
    // erase the one we hold" decision lives in the route, which is where the
    // Firestore version made it too. Asserting preservation HERE would be testing a
    // rule this function does not implement.
    await applySubscriptionStatusInSupabase({
      memberId: SUB, status: "halted",
      periodStart: null, periodEnd: null, cancelledAt: null,
    });
    const halted = await findSubscriptionByRazorpayIdInSupabase(`${P}rzsub`);
    expect(halted).toMatchObject({ status: "halted", currentPeriodStart: null, currentPeriodEnd: null, cancelledAt: null });
  });

  it("survives the read-then-write the route performs around an event with no boundaries", async () => {
    // This is the composition the route relies on: when Razorpay omits current_start
    // and current_end, it passes back the values it just read. Verified as a
    // round trip rather than as a rule inside the writer.
    const start = new Date(Date.UTC(2030, 5, 1));
    const end = new Date(Date.UTC(2030, 6, 1));
    await applySubscriptionChargeInSupabase({ memberId: SUB, periodStart: start, periodEnd: end });

    const before = await findSubscriptionByRazorpayIdInSupabase(`${P}rzsub`);
    expect(before).not.toBeNull();
    await applySubscriptionStatusInSupabase({
      memberId: SUB, status: "halted",
      periodStart: before!.currentPeriodStart,
      periodEnd: before!.currentPeriodEnd,
      cancelledAt: before!.cancelledAt,
    });

    const after = await findSubscriptionByRazorpayIdInSupabase(`${P}rzsub`);
    expect(after?.status).toBe("halted");
    expect(after?.currentPeriodStart?.toISOString()).toBe(start.toISOString());
    expect(after?.currentPeriodEnd?.toISOString()).toBe(end.toISOString());

    const cancelledAt = new Date(Date.UTC(2030, 7, 1));
    await applySubscriptionStatusInSupabase({
      memberId: SUB, status: "cancelled",
      periodStart: after!.currentPeriodStart,
      periodEnd: after!.currentPeriodEnd,
      cancelledAt,
    });
    const cancelled = await findSubscriptionByRazorpayIdInSupabase(`${P}rzsub`);
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.cancelledAt?.toISOString()).toBe(cancelledAt.toISOString());
  });

  it("keeps the member's plan label in step", async () => {
    await syncMemberPlanLabelInSupabase(MEMBER, "rzwtest");
    expect((await getMemberContactInSupabase(MEMBER))?.name).toBe("Webhook member");
    const { rows } = await query<{ plan: string }>(`select plan from public.members where id = $1`, [MEMBER]);
    expect(rows[0].plan).toBe("rzwtest");

    await syncMemberPlanLabelInSupabase(MEMBER, "free");
    const after = await query<{ plan: string }>(`select plan from public.members where id = $1`, [MEMBER]);
    expect(after.rows[0].plan).toBe("free");
  });

  it("records one renewal invoice per Razorpay payment", async () => {
    const values = {
      paymentId: `${P}rzpay`, memberId: SUB, amount: 500, subtotal: 427.35, taxAmount: 72.65,
      taxRate: 18, currency: "INR",
      periodStart: new Date(Date.UTC(2030, 5, 1)), periodEnd: new Date(Date.UTC(2030, 6, 1)),
    };
    expect(await insertSubscriptionInvoiceIfAbsentInSupabase(values)).toBe(true);
    // A replayed subscription.charged must not raise a second invoice.
    expect(await insertSubscriptionInvoiceIfAbsentInSupabase(values)).toBe(false);

    const { rows } = await query<{ n: number }>(
      `select count(*)::int as n from public.subscription_invoices where member_id = $1`,
      [SUB],
    );
    expect(rows[0].n).toBe(1);
  });
});
