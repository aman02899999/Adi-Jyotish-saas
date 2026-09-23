import "server-only";

import { query, queryModel, queryModels, withTransaction } from "@/lib/postgres";

/**
 * Postgres data access for member subscriptions.
 *
 * Deliberately data-only, same split as plans-supabase.ts: the Razorpay calls,
 * the checkout race handling and the active-status rule all stay in
 * src/lib/subscriptions.ts. Splitting it this way avoids a circular import and
 * keeps the billing rules written once whichever database is underneath.
 *
 * member_subscriptions.id equals the member id (the Firestore document was
 * members/{memberId} — no, it was memberSubscriptions/{memberId}, whose id IS
 * the member id), so the lookup is by primary key, not by member_id. The unique
 * index on member_id makes both equivalent; the pk is what the copy script
 * writes.
 */

/** Mirrors MemberSubscription in subscriptions.ts. */
export type SubscriptionRow = {
  id: string;
  memberId: string;
  planId: string;
  billingInterval: "monthly" | "yearly";
  status: string;
  razorpaySubscriptionId: string | null;
  razorpayCustomerId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getMemberSubscriptionInSupabase(memberId: string): Promise<SubscriptionRow | null> {
  return queryModel<SubscriptionRow>(
    `select id, member_id, plan_id, billing_interval, status, razorpay_subscription_id,
            razorpay_customer_id, current_period_start, current_period_end,
            cancel_at_period_end, cancelled_at, created_at, updated_at
       from public.member_subscriptions
      where id = $1`,
    [memberId],
  );
}

/** Mirrors SubscriptionInvoice in subscriptions.ts. */
export type SubscriptionInvoiceRow = {
  id: string;
  subscriptionId: string;
  memberId: string;
  amount: number;
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  currency: string;
  status: string;
  razorpayPaymentId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date;
};

/** amount/subtotal/tax_amount are numeric(14,2) and tax_rate numeric(6,3), which
 * node-postgres returns as strings. Naming them here is what turns them back into
 * numbers — invoice totals computed on a string silently concatenate. */
const INVOICE_NUMERIC_COLUMNS = ["amount", "subtotal", "taxAmount", "taxRate"] as const;

export async function getSubscriptionInvoicesInSupabase(memberId: string): Promise<SubscriptionInvoiceRow[]> {
  return queryModels<SubscriptionInvoiceRow>(
    `select id, subscription_id, member_id, amount, subtotal, tax_amount, tax_rate,
            currency, status, razorpay_payment_id, period_start, period_end, created_at
       from public.subscription_invoices
      where member_id = $1
      order by created_at asc`,
    [memberId],
    INVOICE_NUMERIC_COLUMNS,
  );
}

/**
 * ---------------------------------------------------------------------------
 * Writes.
 *
 * The reads above were ported first and the writes were not, which left the
 * module half-gated: getMemberSubscription read Postgres while
 * startSubscriptionCheckout wrote Firestore. Under cutover that charged the
 * member at Razorpay and then failed verification with "No matching
 * subscription attempt was found", because the row the verify step looked for
 * had been written to the other database. Renewals never matched either, since
 * the webhook resolves by razorpay_subscription_id in Postgres.
 *
 * Same split as the reads: no Razorpay calls and no billing rules here, only
 * the statements.
 * ---------------------------------------------------------------------------
 */

/** What the checkout claim found already on file, so the caller can restore it on failure. */
export type ClaimedCheckout = { previousStatus: string | null; razorpayCustomerId: string | null; hadRow: boolean };

/**
 * Claims the member's subscription slot as `pending_checkout` before Razorpay is called, and
 * returns what was there before.
 *
 * `insert … on conflict do update` with the guard in the where clause is what closes the race the
 * Firestore transaction closed: two concurrent checkouts cannot both claim, so only one real
 * Razorpay subscription is ever created. The loser's update matches no row, so `rowCount` is 0
 * and this throws — rather than both proceeding and stranding one billing subscription with no
 * record of it anywhere in the app.
 *
 * A claim older than the TTL is reclaimable, so a checkout abandoned mid-flight (page closed)
 * does not lock the member out until someone intervenes.
 */
export async function claimSubscriptionCheckoutInSupabase(
  memberId: string,
  planId: string,
  activeStatuses: readonly string[],
  pendingTtlMs: number,
): Promise<ClaimedCheckout> {
  return withTransaction(async (client) => {
    const before = await client.query<{ status: string; razorpay_customer_id: string | null }>(
      `select status, razorpay_customer_id from public.member_subscriptions where id = $1 for update`,
      [memberId],
    );
    const existing = before.rows[0] ?? null;

    const claimed = await client.query(
      `insert into public.member_subscriptions (id, member_id, plan_id, status, created_at, updated_at)
            values ($1, $1, $2, 'pending_checkout', now(), now())
       on conflict (id) do update
              set status = 'pending_checkout', updated_at = now()
            where public.member_subscriptions.status <> all ($3::text[])
              and (public.member_subscriptions.status <> 'pending_checkout'
                   or public.member_subscriptions.updated_at < now() - make_interval(secs => $4))`,
      [memberId, planId, [...activeStatuses], pendingTtlMs / 1000],
    );
    if (claimed.rowCount === 0) {
      throw new Error("You already have a membership in progress. Manage it from Billing.");
    }

    return {
      previousStatus: existing?.status ?? null,
      razorpayCustomerId: existing?.razorpay_customer_id ?? null,
      hadRow: Boolean(existing),
    };
  });
}

/** Puts the claim back after a failed Razorpay call, so the member is not stranded for the TTL. */
export async function releaseSubscriptionCheckoutInSupabase(memberId: string, previousStatus: string | null): Promise<void> {
  await query(
    `update public.member_subscriptions set status = $2, updated_at = now() where id = $1`,
    [memberId, previousStatus ?? "cancelled"],
  );
}

/** Records the subscription Razorpay just created against the claimed row. */
export async function recordSubscriptionCheckoutInSupabase(input: {
  memberId: string;
  planId: string;
  billingInterval: "monthly" | "yearly";
  status: string;
  razorpaySubscriptionId: string;
}): Promise<void> {
  await query(
    `update public.member_subscriptions
        set plan_id = $2, billing_interval = $3, status = $4, razorpay_subscription_id = $5,
            cancel_at_period_end = false, cancelled_at = null, updated_at = now()
      where id = $1`,
    [input.memberId, input.planId, input.billingInterval, input.status, input.razorpaySubscriptionId],
  );
}

/** Marks the subscription live once the payment signature has been verified. */
export async function activateSubscriptionInSupabase(input: {
  memberId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date | null;
}): Promise<void> {
  await query(
    `update public.member_subscriptions
        set status = $2, current_period_start = $3, current_period_end = $4, updated_at = now()
      where id = $1`,
    [input.memberId, input.status, input.currentPeriodStart, input.currentPeriodEnd],
  );
}

/** Applies a Razorpay cancellation. */
export async function cancelSubscriptionInSupabase(input: {
  memberId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
}): Promise<void> {
  await query(
    `update public.member_subscriptions
        set status = $2, cancel_at_period_end = $3, cancelled_at = $4, updated_at = now()
      where id = $1`,
    [input.memberId, input.status, input.cancelAtPeriodEnd, input.cancelledAt],
  );
}

/** Keeps members.plan in step with the subscription, as syncMemberPlanLabel does on Firestore. */
export async function syncMemberPlanLabelInSupabase(memberId: string, label: string): Promise<void> {
  await query(`update public.members set plan = $2, updated_at = now() where id = $1`, [memberId, label]);
}

/**
 * Writes the paid invoice for a verified subscription payment.
 *
 * Idempotent on razorpay_payment_id, which is what stops a retried verify call (double submit,
 * a client that retries on timeout) billing the member twice on the ledger. Firestore achieved
 * this with the payment id as the document id and a create() that fails on collision; here it is
 * the partial unique index added in 0012, named explicitly as the conflict target so that a
 * collision on any *other* constraint still raises instead of being silently swallowed.
 *
 * Returns whether a row was written, so the caller can tell "recorded" from "already recorded".
 */
export async function recordSubscriptionInvoiceInSupabase(input: {
  id: string;
  subscriptionId: string;
  memberId: string;
  amount: number;
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  currency: string;
  razorpayPaymentId: string;
  periodStart: Date;
  periodEnd: Date | null;
}): Promise<boolean> {
  const result = await query(
    `insert into public.subscription_invoices
       (id, subscription_id, member_id, amount, subtotal, tax_amount, tax_rate, currency,
        status, razorpay_payment_id, period_start, period_end, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'paid', $9, $10, $11, now())
     on conflict (razorpay_payment_id) where razorpay_payment_id is not null do nothing`,
    [input.id, input.subscriptionId, input.memberId, input.amount, input.subtotal, input.taxAmount,
     input.taxRate, input.currency, input.razorpayPaymentId, input.periodStart, input.periodEnd],
  );
  return (result.rowCount ?? 0) > 0;
}
