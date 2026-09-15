import "server-only";

import { queryModel, queryModels } from "@/lib/postgres";

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
