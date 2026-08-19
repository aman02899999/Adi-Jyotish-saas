import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import type { MembershipPlan } from "@/lib/plans";
import type { MemberIdentity } from "@/lib/member-auth";
import { getRazorpay, getRazorpayKeyId, verifyRazorpaySubscriptionSignature } from "@/lib/razorpay";

// Only "active" represents a subscription that has actually been paid for and is currently in
// force. "created"/"authenticated" happen before the first charge is ever captured (a member who
// abandons checkout right after this point would otherwise keep the doc in one of these statuses
// forever and get the plan discount for free), and "halted" means Razorpay's renewal charge has
// been failing — also not something that should keep granting a discount.
const activeStatuses = new Set(["active"]);
// A checkout in flight — after the member's account is claimed for this attempt (closing the race
// below) but before Razorpay has actually created the subscription, or while the payment modal is
// still open. Reclaimable after a short TTL so a crashed/abandoned attempt doesn't lock the member
// out of ever trying again.
const PENDING_CHECKOUT_TTL_MS = 5 * 60 * 1000;

export type MemberSubscription = {
  id: string; // == memberId
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

export type MemberSubscriptionWithPlan = MemberSubscription & { plan: MembershipPlan };

export type SubscriptionInvoice = {
  id: string;
  subscriptionId: string; // == memberId
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

function toDate(value: FirebaseFirestore.Timestamp | Date | undefined | null): Date {
  if (!value) return new Date();
  return value instanceof Date ? value : value.toDate();
}

function toDateOrNull(value: FirebaseFirestore.Timestamp | Date | undefined | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : value.toDate();
}

function subscriptionsCollection() {
  return db.collection("memberSubscriptions");
}

function subscriptionInvoicesCollection() {
  return db.collection("subscriptionInvoices");
}

function subscriptionFromSnap(snap: FirebaseFirestore.DocumentSnapshot): MemberSubscription {
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    memberId: snap.id,
    planId: data.planId as string,
    billingInterval: (data.billingInterval as "monthly" | "yearly") ?? "monthly",
    status: (data.status as string) ?? "created",
    razorpaySubscriptionId: (data.razorpaySubscriptionId as string | null) ?? null,
    razorpayCustomerId: (data.razorpayCustomerId as string | null) ?? null,
    currentPeriodStart: toDateOrNull(data.currentPeriodStart as FirebaseFirestore.Timestamp | undefined),
    currentPeriodEnd: toDateOrNull(data.currentPeriodEnd as FirebaseFirestore.Timestamp | undefined),
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
    cancelledAt: toDateOrNull(data.cancelledAt as FirebaseFirestore.Timestamp | undefined),
    createdAt: toDate(data.createdAt as FirebaseFirestore.Timestamp),
    updatedAt: toDate(data.updatedAt as FirebaseFirestore.Timestamp),
  };
}

function subscriptionInvoiceFromSnap(snap: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot): SubscriptionInvoice {
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    subscriptionId: data.subscriptionId as string,
    memberId: data.memberId as string,
    amount: data.amount as number,
    // Older invoices predate the GST split — fall back to treating the whole amount as subtotal
    // (0 tax) rather than showing NaN/undefined for historical records.
    subtotal: (data.subtotal as number | undefined) ?? (data.amount as number),
    taxAmount: (data.taxAmount as number | undefined) ?? 0,
    taxRate: (data.taxRate as number | undefined) ?? 0,
    currency: data.currency as string,
    status: (data.status as string) ?? "paid",
    razorpayPaymentId: (data.razorpayPaymentId as string | null) ?? null,
    periodStart: toDateOrNull(data.periodStart as FirebaseFirestore.Timestamp | undefined),
    periodEnd: toDateOrNull(data.periodEnd as FirebaseFirestore.Timestamp | undefined),
    createdAt: toDate(data.createdAt as FirebaseFirestore.Timestamp),
  };
}

async function planById(planId: string): Promise<MembershipPlan> {
  const { getPlanById } = await import("@/lib/plans");
  const plan = await getPlanById(planId);
  if (!plan) throw new Error("Membership plan not found.");
  return plan;
}

export async function getMemberSubscription(memberId: string): Promise<MemberSubscriptionWithPlan | null> {
  const snap = await subscriptionsCollection().doc(memberId).get();
  if (!snap.exists) return null;
  const subscription = subscriptionFromSnap(snap);
  const plan = await planById(subscription.planId);
  return { ...subscription, plan };
}

export async function getSubscriptionInvoices(memberId: string): Promise<SubscriptionInvoice[]> {
  const snap = await subscriptionInvoicesCollection().where("memberId", "==", memberId).orderBy("createdAt", "asc").get();
  return snap.docs.map((doc) => subscriptionInvoiceFromSnap(doc));
}

export async function getMemberDiscountPercent(memberId: string): Promise<number> {
  const subscription = await getMemberSubscription(memberId);
  if (!subscription || !activeStatuses.has(subscription.status)) return 0;
  return subscription.plan.sessionDiscountPercent;
}

export function applyDiscount(amount: number, discountPercent: number) {
  if (!discountPercent) return amount;
  return Math.max(0, Math.round(amount * (100 - discountPercent) / 100));
}

async function syncMemberPlanLabel(memberId: string, label: string) {
  await db.collection("members").doc(memberId).update({ plan: label, updatedAt: FieldValue.serverTimestamp() });
}

export async function startSubscriptionCheckout(member: MemberIdentity, plan: MembershipPlan, interval: "monthly" | "yearly") {
  const razorpay = getRazorpay();
  if (!razorpay) throw new Error("Online payments are not configured.");

  const razorpayPlanId = interval === "yearly" ? plan.razorpayPlanIdYearly : plan.razorpayPlanIdMonthly;
  if (!razorpayPlanId) throw new Error("This plan is not available for the selected billing interval.");

  const ref = subscriptionsCollection().doc(member.id);
  const now = FieldValue.serverTimestamp();

  // Claiming a "pending_checkout" placeholder atomically (inside a transaction, before ever
  // calling Razorpay) is what actually closes the race — a plain read-then-write here would let
  // two concurrent requests (double-click, retried request) both pass the "no existing
  // subscription" check and each create a real, billing Razorpay subscription; only the last
  // Firestore write would survive, leaving the other one orphaned and still charging the member's
  // card with no record of it anywhere in the app. Reclaimable after a short TTL so a
  // crashed/abandoned attempt (page closed mid-checkout) doesn't lock the member out forever.
  const existingData = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
    const status = data?.status as string | undefined;
    const updatedAt = data?.updatedAt as FirebaseFirestore.Timestamp | undefined;
    const claimIsStale = status === "pending_checkout" && (!updatedAt || Date.now() - updatedAt.toMillis() > PENDING_CHECKOUT_TTL_MS);
    if (status && (activeStatuses.has(status) || (status === "pending_checkout" && !claimIsStale))) {
      throw new Error("You already have a membership in progress. Manage it from Billing.");
    }
    tx.set(ref, { status: "pending_checkout", updatedAt: now, ...(snap.exists ? {} : { createdAt: now }) }, { merge: true });
    return data;
  });

  let subscription;
  try {
    subscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      total_count: interval === "yearly" ? 5 : 60,
      customer_notify: true,
      notes: { memberId: member.id, planKey: plan.key },
    });
  } catch (error) {
    // Release the claim back to whatever it was before, so a failed Razorpay call doesn't strand
    // the member in "pending_checkout" for the full TTL.
    await ref.set({ status: (existingData?.status as string) ?? "cancelled", updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    throw error;
  }

  await ref.set({
    planId: plan.id,
    billingInterval: interval,
    status: subscription.status,
    razorpaySubscriptionId: subscription.id,
    razorpayCustomerId: (existingData?.razorpayCustomerId as string | null) ?? null,
    currentPeriodStart: existingData?.currentPeriodStart ?? null,
    currentPeriodEnd: existingData?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { subscriptionId: subscription.id, key: getRazorpayKeyId()! };
}

export async function verifySubscriptionCheckout(member: MemberIdentity, subscriptionId: string, paymentId: string, signature: string): Promise<void> {
  if (!verifyRazorpaySubscriptionSignature(paymentId, subscriptionId, signature)) {
    throw new Error("Payment signature could not be verified.");
  }

  const record = await getMemberSubscription(member.id);
  if (!record || record.razorpaySubscriptionId !== subscriptionId) {
    throw new Error("No matching subscription attempt was found.");
  }

  const razorpay = getRazorpay();
  const remote = razorpay ? await razorpay.subscriptions.fetch(subscriptionId) : null;
  const now = new Date();
  await subscriptionsCollection().doc(member.id).update({
    status: remote?.status ?? "active",
    currentPeriodStart: remote?.current_start ? new Date(remote.current_start * 1000) : now,
    currentPeriodEnd: remote?.current_end ? new Date(remote.current_end * 1000) : null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await syncMemberPlanLabel(member.id, record.plan.key);

  const amount = record.billingInterval === "yearly" ? record.plan.priceYearly ?? record.plan.priceMonthly : record.plan.priceMonthly;
  const { getStudioSettings } = await import("@/lib/studio-settings");
  const { splitGstInclusive } = await import("@/lib/gst");
  const settings = await getStudioSettings();
  // Listed prices are GST-inclusive, matching how booking and gemstone invoices already split it.
  const { subtotal, taxAmount } = splitGstInclusive(amount, settings.gstRate);

  // Doc id == razorpayPaymentId: idempotency via "does this doc exist" (create() fails silently
  // if it does), replacing the old onConflictDoNothing({ target: subscriptionInvoices.razorpayPaymentId }).
  const invoiceRef = subscriptionInvoicesCollection().doc(paymentId);
  try {
    await invoiceRef.create({
      subscriptionId: record.id,
      memberId: member.id,
      amount,
      subtotal,
      taxAmount,
      taxRate: settings.gstRate,
      currency: record.plan.currency,
      status: "paid",
      razorpayPaymentId: paymentId,
      periodStart: remote?.current_start ? new Date(remote.current_start * 1000) : now,
      periodEnd: remote?.current_end ? new Date(remote.current_end * 1000) : null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code: unknown }).code : undefined;
    if (code !== 6) throw error;
  }
}

export async function cancelMemberSubscription(memberId: string, immediately: boolean): Promise<void> {
  const record = await getMemberSubscription(memberId);
  if (!record || !record.razorpaySubscriptionId) throw new Error("No active membership to cancel.");
  if (["cancelled", "completed", "expired"].includes(record.status)) throw new Error("This membership is already cancelled.");

  const razorpay = getRazorpay();
  if (!razorpay) throw new Error("Online payments are not configured.");
  const cancelled = await razorpay.subscriptions.cancel(record.razorpaySubscriptionId, !immediately);

  const now = new Date();
  await subscriptionsCollection().doc(memberId).update({
    status: cancelled.status,
    cancelAtPeriodEnd: !immediately,
    cancelledAt: immediately ? now : null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (immediately) await syncMemberPlanLabel(memberId, "free");
}
