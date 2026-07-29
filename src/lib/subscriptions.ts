import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberSubscriptions, memberUsers, membershipPlans, subscriptionInvoices, type MembershipPlan } from "@/db/schema";
import type { MemberIdentity } from "@/lib/member-auth";
import { getRazorpay, verifyRazorpaySubscriptionSignature } from "@/lib/razorpay";

const activeStatuses = new Set(["created", "authenticated", "active", "pending", "halted"]);

export type MemberSubscriptionWithPlan = typeof memberSubscriptions.$inferSelect & { plan: MembershipPlan };

export async function getMemberSubscription(memberId: number): Promise<MemberSubscriptionWithPlan | null> {
  const [row] = await db.select({ subscription: memberSubscriptions, plan: membershipPlans })
    .from(memberSubscriptions)
    .innerJoin(membershipPlans, eq(memberSubscriptions.planId, membershipPlans.id))
    .where(eq(memberSubscriptions.memberId, memberId))
    .limit(1);
  if (!row) return null;
  return { ...row.subscription, plan: row.plan };
}

export async function getSubscriptionInvoices(memberId: number) {
  return db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.memberId, memberId)).orderBy(subscriptionInvoices.createdAt);
}

async function syncMemberPlanLabel(memberId: number, label: string) {
  await db.update(memberUsers).set({ plan: label, updatedAt: new Date() }).where(eq(memberUsers.id, memberId));
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
    notes: { memberId: String(member.id), planKey: plan.key },
  });

  await db.insert(memberSubscriptions).values({
    memberId: member.id,
    planId: plan.id,
    billingInterval: interval,
    status: subscription.status,
    razorpaySubscriptionId: subscription.id,
  }).onConflictDoUpdate({
    target: memberSubscriptions.memberId,
    set: { planId: plan.id, billingInterval: interval, status: subscription.status, razorpaySubscriptionId: subscription.id, cancelAtPeriodEnd: false, cancelledAt: null, updatedAt: new Date() },
  });

  return { subscriptionId: subscription.id, key: process.env.RAZORPAY_KEY_ID! };
}

export async function verifySubscriptionCheckout(member: MemberIdentity, subscriptionId: string, paymentId: string, signature: string) {
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
  await db.update(memberSubscriptions).set({
    status: remote?.status ?? "active",
    currentPeriodStart: remote?.current_start ? new Date(remote.current_start * 1000) : now,
    currentPeriodEnd: remote?.current_end ? new Date(remote.current_end * 1000) : null,
    updatedAt: now,
  }).where(eq(memberSubscriptions.id, record.id));

  await syncMemberPlanLabel(member.id, record.plan.key);
  await db.insert(subscriptionInvoices).values({
    subscriptionId: record.id,
    memberId: member.id,
    amount: record.billingInterval === "yearly" ? record.plan.priceYearly ?? record.plan.priceMonthly : record.plan.priceMonthly,
    currency: record.plan.currency,
    status: "paid",
    razorpayPaymentId: paymentId,
    periodStart: remote?.current_start ? new Date(remote.current_start * 1000) : now,
    periodEnd: remote?.current_end ? new Date(remote.current_end * 1000) : null,
  }).onConflictDoNothing({ target: subscriptionInvoices.razorpayPaymentId });
}

export async function cancelMemberSubscription(member: MemberIdentity, immediately: boolean) {
  const record = await getMemberSubscription(member.id);
  if (!record || !record.razorpaySubscriptionId) throw new Error("No active membership to cancel.");
  if (["cancelled", "completed", "expired"].includes(record.status)) throw new Error("This membership is already cancelled.");

  const razorpay = getRazorpay();
  if (!razorpay) throw new Error("Online payments are not configured.");
  const cancelled = await razorpay.subscriptions.cancel(record.razorpaySubscriptionId, !immediately);

  const now = new Date();
  await db.update(memberSubscriptions).set({
    status: cancelled.status,
    cancelAtPeriodEnd: !immediately,
    cancelledAt: immediately ? now : null,
    updatedAt: now,
  }).where(eq(memberSubscriptions.id, record.id));

  if (immediately) await syncMemberPlanLabel(member.id, "free");
}
