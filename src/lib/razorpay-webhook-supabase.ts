import "server-only";

import { query } from "@/lib/postgres";

/**
 * Postgres data access for the Razorpay webhook.
 *
 * Data-only, same split as the other twins. What stays in the route: signature
 * verification, event dispatch, the GST split, the amount fallbacks and every
 * notification. This module only moves rows.
 *
 * Three things here are worth reading before changing:
 *
 * 1. The dunning cooldown flag lives on `member_subscriptions`, not on `members`.
 *    Firestore kept it on the member document; the schema put it on the
 *    subscription, which is where it belongs. Because `member_subscriptions.id`
 *    IS the member id there is exactly one row per member, so the cooldown window
 *    behaves the same either way.
 *
 * 2. `payment_failure_counters.payment_id` is NOT NULL, but the counter is
 *    per-member, not per-payment — the Firestore doc was keyed by memberId and
 *    carried no payment id at all. It is set to the member id so the column is
 *    satisfied without inventing a value that means nothing.
 *
 * 3. The failure counter is one statement, not a transaction. The Firestore
 *    version needed a transaction because read-then-write on a counter is a lost
 *    update otherwise; the `on conflict do update` form is atomic on its own, and
 *    `returning count` gives the caller the post-increment value to threshold.
 */

// ------------------------------------------------------------------- dedup

/**
 * Claims an event id. Returns false when another delivery already claimed it.
 *
 * This is the webhook's idempotency gate. `on conflict do nothing` plus the row
 * count is the whole check — the primary key is the Razorpay event id, so there
 * is no separate "does this exist" read to race against.
 */
export async function claimRazorpayEventInSupabase(eventId: string, type: string): Promise<boolean> {
  const result = await query(
    `insert into public.razorpay_events (id, type, processed_at)
     values ($1, $2, now())
     on conflict do nothing`,
    [eventId, type.slice(0, 80)],
  );
  return (result.rowCount ?? 0) === 1;
}

/**
 * Releases a claim after the handler threw.
 *
 * Razorpay retries until it gets a 2xx, so a claim left behind on a genuine
 * failure would make the retry look like a duplicate and the event would never be
 * processed.
 */
export async function releaseRazorpayEventInSupabase(eventId: string): Promise<void> {
  await query(`delete from public.razorpay_events where id = $1`, [eventId]);
}

// ----------------------------------------------------------------- payments

export type WebhookPaymentRow = {
  id: string;
  invoiceId: string | null;
  bookingId: string | null;
  status: string;
};

/** `query` returns raw snake_case rows — unlike queryModel/queryModels it does not
 * camel-case them — so the aliases here are what make the row match its type. */
const PAYMENT_PROJECTION = 'id, invoice_id as "invoiceId", booking_id as "bookingId", status';

/** The payment row carrying a given Razorpay order id, or null. */
export async function getPaymentByOrderIdInSupabase(orderId: string): Promise<WebhookPaymentRow | null> {
  const { rows } = await query<WebhookPaymentRow>(
    `select ${PAYMENT_PROJECTION} from public.payments where provider_session_id = $1 limit 1`,
    [orderId],
  );
  return rows[0] ?? null;
}

/**
 * A payment waiting on refund confirmation, or null.
 *
 * The status filter is part of the lookup rather than a check afterwards: a
 * refund webhook replayed after the refund already settled must find nothing, or
 * it would run the refund transition a second time.
 */
export async function getRefundablePaymentInSupabase(paymentIntentId: string): Promise<WebhookPaymentRow | null> {
  const { rows } = await query<WebhookPaymentRow>(
    `select ${PAYMENT_PROJECTION} from public.payments
      where payment_intent_id = $1 and status = 'refund_pending'
      limit 1`,
    [paymentIntentId],
  );
  return rows[0] ?? null;
}

/**
 * Marks a payment failed. Returns false when it was not still pending.
 *
 * The guard is in the statement's own predicate, so a late `payment.failed`
 * arriving after the payment succeeded cannot overwrite it.
 */
export async function markPaymentFailedInSupabase(paymentId: string): Promise<boolean> {
  const result = await query(
    `update public.payments set status = 'failed', updated_at = now()
      where id = $1 and status = 'pending'`,
    [paymentId],
  );
  return (result.rowCount ?? 0) === 1;
}

// ------------------------------------------------- payment-failure risk counter

/**
 * Records one failed charge attempt and returns the count inside the current window.
 *
 * Single statement, so no lock and no lost update: the CASE reads the row's own
 * window_start, and when the window has elapsed the counter restarts at 1 with a
 * fresh window rather than growing forever.
 */
export async function bumpPaymentFailureCounterInSupabase(memberId: string): Promise<number> {
  const { rows } = await query<{ count: number }>(
    `insert into public.payment_failure_counters (id, payment_id, count, window_start)
     values ($1, $1, 1, now())
     on conflict (id) do update
       set count = case
             when public.payment_failure_counters.window_start > now() - interval '24 hours'
             then public.payment_failure_counters.count + 1
             else 1
           end,
           window_start = case
             when public.payment_failure_counters.window_start > now() - interval '24 hours'
             then public.payment_failure_counters.window_start
             else now()
           end,
           updated_at = now()
     returning count::int`,
    [memberId],
  );
  return Number(rows[0]?.count ?? 1);
}

/** Name and email for an admin notification, or null if the member is gone. */
export async function getMemberContactInSupabase(memberId: string): Promise<{ name: string; email: string } | null> {
  const { rows } = await query<{ name: string; email: string }>(
    `select name, email::text as email from public.members where id = $1`,
    [memberId],
  );
  return rows[0] ?? null;
}

// ------------------------------------------------------------------ dunning

/**
 * The member's contact details with the last dunning notice time.
 *
 * Null when there is no subscription row, which also means there is nothing to
 * dun — the flag lives on the subscription, so the two cannot disagree.
 */
export async function getDunningStateInSupabase(
  memberId: string,
): Promise<{ name: string; email: string; dunningNoticeSentAt: Date | null } | null> {
  const { rows } = await query<{ name: string; email: string; dunning_notice_sent_at: Date | null }>(
    `select m.name, m.email::text as email, s.dunning_notice_sent_at
       from public.member_subscriptions s
       join public.members m on m.id = s.member_id
      where s.id = $1`,
    [memberId],
  );
  const row = rows[0];
  if (!row) return null;
  return { name: row.name, email: row.email, dunningNoticeSentAt: row.dunning_notice_sent_at };
}

export async function markDunningNoticeSentInSupabase(memberId: string): Promise<void> {
  await query(
    `update public.member_subscriptions set dunning_notice_sent_at = now(), updated_at = now() where id = $1`,
    [memberId],
  );
}

// ----------------------------------------------------------- subscriptions

export type WebhookSubscriptionRow = {
  memberId: string;
  planId: string;
  billingInterval: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelledAt: Date | null;
};

/** The subscription row behind a Razorpay subscription id, or null. */
export async function findSubscriptionByRazorpayIdInSupabase(
  razorpaySubscriptionId: string,
): Promise<WebhookSubscriptionRow | null> {
  const { rows } = await query<{
    id: string;
    member_id: string;
    plan_id: string;
    billing_interval: string;
    status: string;
    current_period_start: Date | null;
    current_period_end: Date | null;
    cancelled_at: Date | null;
  }>(
    `select id, member_id, plan_id, billing_interval, status,
            current_period_start, current_period_end, cancelled_at
       from public.member_subscriptions
      where razorpay_subscription_id = $1
      limit 1`,
    [razorpaySubscriptionId],
  );
  const row = rows[0];
  if (!row) return null;
  // `id` is the member id — that is how the Firestore document was keyed, and the
  // route identifies the member by it. Taken from the row rather than assumed.
  return {
    memberId: row.id,
    planId: row.plan_id,
    billingInterval: row.billing_interval,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelledAt: row.cancelled_at,
  };
}

/**
 * Records a successful renewal charge: reactivates the subscription, moves the
 * billing period on, and clears the renewal reminder so it can fire again.
 */
export async function applySubscriptionChargeInSupabase(input: {
  memberId: string;
  periodStart: Date;
  periodEnd: Date | null;
}): Promise<void> {
  await query(
    `update public.member_subscriptions
        set status = 'active',
            current_period_start = $2,
            current_period_end = $3,
            renewal_reminder_sent_at = null,
            updated_at = now()
      where id = $1`,
    [input.memberId, input.periodStart, input.periodEnd],
  );
}

/** Applies a Razorpay subscription status transition. */
export async function applySubscriptionStatusInSupabase(input: {
  memberId: string;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelledAt: Date | null;
}): Promise<void> {
  await query(
    `update public.member_subscriptions
        set status = $2,
            current_period_start = $3,
            current_period_end = $4,
            cancelled_at = $5,
            updated_at = now()
      where id = $1`,
    [input.memberId, input.status, input.periodStart, input.periodEnd, input.cancelledAt],
  );
}

/** Keeps `members.plan` in step with the subscription the member actually holds. */
export async function syncMemberPlanLabelInSupabase(memberId: string, label: string): Promise<void> {
  await query(`update public.members set plan = $2, updated_at = now() where id = $1`, [memberId, label]);
}

/**
 * Records a renewal invoice. Returns false when one for that payment already exists.
 *
 * The primary key is the Razorpay payment id, so a replayed `subscription.charged`
 * cannot raise a second invoice for the same charge.
 */
export async function insertSubscriptionInvoiceIfAbsentInSupabase(values: {
  paymentId: string;
  memberId: string;
  amount: number;
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date | null;
}): Promise<boolean> {
  const result = await query(
    `insert into public.subscription_invoices
       (id, subscription_id, member_id, amount, subtotal, tax_amount, tax_rate, currency,
        status, razorpay_payment_id, period_start, period_end, created_at)
     values ($1, $2, $2, $3, $4, $5, $6, $7, 'paid', $1, $8, $9, now())
     on conflict do nothing`,
    [
      values.paymentId, values.memberId, values.amount, values.subtotal, values.taxAmount,
      values.taxRate, values.currency, values.periodStart, values.periodEnd,
    ],
  );
  return (result.rowCount ?? 0) === 1;
}
