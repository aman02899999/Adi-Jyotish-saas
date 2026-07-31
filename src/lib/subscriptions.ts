import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import type { MembershipPlan } from "@/lib/plans";
import type { MemberIdentity } from "@/lib/member-auth";
import { getRazorpay, getRazorpayKeyId, verifyRazorpaySubscriptionSignature } from "@/lib/razorpay";

const activeStatuses = new Set(["created", "authenticated", "active", "pending", "halted"]);

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

  const existing = await getMemberSubscription(member.id);
  if (existing && activeStatuses.has(existing.status)) {
    throw new Error("You already have a membership in progress. Manage it from Billing.");
  }

  const subscription = await razorpay.subscriptions.create({
    plan_id: razorpayPlanId,
    total_count: interval === "yearly" ? 5 : 60,
    customer_notify: true,
    notes: { memberId: member.id, planKey: plan.key },
  });

  const ref = subscriptionsCollection().doc(member.id);
  const now = FieldValue.serverTimestamp();
  await ref.set({
    planId: plan.id,
    billingInterval: interval,
    status: subscription.status,
    razorpaySubscriptionId: subscription.id,
    razorpayCustomerId: existing?.razorpayCustomerId ?? null,
    currentPeriodStart: existing?.currentPeriodStart ?? null,
    currentPeriodEnd: existing?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    ...(existing ? {} : { createdAt: now }),
    updatedAt: now,
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

  // Doc id == razorpayPaymentId: idempotency via "does this doc exist" (create() fails silently
  // if it does), replacing the old onConflictDoNothing({ target: subscriptionInvoices.razorpayPaymentId }).
  const invoiceRef = subscriptionInvoicesCollection().doc(paymentId);
  try {
    await invoiceRef.create({
      subscriptionId: record.id,
      memberId: member.id,
      amount: record.billingInterval === "yearly" ? record.plan.priceYearly ?? record.plan.priceMonthly : record.plan.priceMonthly,
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

export async function cancelMemberSubscription(member: MemberIdentity, immediately: boolean): Promise<void> {
  const record = await getMemberSubscription(member.id);
  if (!record || !record.razorpaySubscriptionId) throw new Error("No active membership to cancel.");
  if (["cancelled", "completed", "expired"].includes(record.status)) throw new Error("This membership is already cancelled.");

  const razorpay = getRazorpay();
  if (!razorpay) throw new Error("Online payments are not configured.");
  const cancelled = await razorpay.subscriptions.cancel(record.razorpaySubscriptionId, !immediately);

  const now = new Date();
  await subscriptionsCollection().doc(member.id).update({
    status: cancelled.status,
    cancelAtPeriodEnd: !immediately,
    cancelledAt: immediately ? now : null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (immediately) await syncMemberPlanLabel(member.id, "free");
}
