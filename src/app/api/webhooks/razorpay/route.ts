import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, invoices, memberSubscriptions, memberUsers, membershipPlans, payments, razorpayEvents, subscriptionInvoices } from "@/db/schema";
import { sendBookingNotification } from "@/lib/messaging";
import { isRazorpayWebhookConfigured, verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { rechargeWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";

type RazorpayWebhookPayment = {
  id: string;
  order_id?: string | null;
  status: string;
  amount?: number;
  currency?: string;
  notes?: Record<string, string>;
};

type RazorpayWebhookRefund = {
  id: string;
  payment_id: string;
  status: string;
};

type RazorpayWebhookSubscription = {
  id: string;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number;
  ended_at?: number | null;
  notes?: Record<string, string>;
};

type RazorpayWebhookBody = {
  event: string;
  payload?: {
    payment?: { entity?: RazorpayWebhookPayment };
    refund?: { entity?: RazorpayWebhookRefund };
    subscription?: { entity?: RazorpayWebhookSubscription };
  };
};

const terminalSubscriptionStatuses = new Set(["cancelled", "completed", "expired"]);

export async function POST(request: Request) {
  if (!isRazorpayWebhookConfigured()) {
    return Response.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Malformed webhook payload." }, { status: 400 });
  }

  const eventId = request.headers.get("x-razorpay-event-id") || `${body.event}:${rawBody.length}:${Date.now()}`;
  const inserted = await db.insert(razorpayEvents).values({ razorpayEventId: eventId, type: body.event }).onConflictDoNothing({ target: razorpayEvents.razorpayEventId }).returning({ id: razorpayEvents.id });
  if (!inserted.length) {
    return Response.json({ ok: true, deduped: true });
  }

  try {
    if (body.event === "payment.captured") await handlePaymentCaptured(body.payload?.payment?.entity);
    else if (body.event === "payment.failed") await handlePaymentFailed(body.payload?.payment?.entity);
    else if (body.event === "refund.processed") await handleRefundProcessed(body.payload?.refund?.entity);
    else if (body.event === "subscription.charged") await handleSubscriptionCharged(body.payload?.subscription?.entity, body.payload?.payment?.entity);
    else if (body.event === "subscription.activated" || body.event === "subscription.authenticated") await handleSubscriptionStatus(body.payload?.subscription?.entity);
    else if (["subscription.cancelled", "subscription.completed", "subscription.halted", "subscription.paused", "subscription.pending"].includes(body.event)) await handleSubscriptionStatus(body.payload?.subscription?.entity);
  } catch (error) {
    console.error(`Razorpay webhook handling failed for ${body.event}`, error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return Response.json({ ok: true });
}

async function handlePaymentCaptured(payment?: RazorpayWebhookPayment) {
  if (!payment?.order_id) return;
  const [row] = await db.select().from(payments).where(eq(payments.providerSessionId, payment.order_id)).limit(1);
  if (!row) {
    const memberId = Number(payment.notes?.memberId);
    if (Number.isInteger(memberId) && memberId > 0 && payment.amount != null) {
      await rechargeWallet({ memberId, amount: Math.round(payment.amount / 100), razorpayPaymentId: payment.id });
    }
    return;
  }
  if (row.status === "succeeded") return;

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, row.invoiceId)).limit(1);
  if (!invoice || invoice.status === "paid") return;

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "succeeded", paymentIntentId: payment.id, paidAt: now, updatedAt: now }).where(eq(payments.id, row.id));
    await tx.update(invoices).set({ status: "paid", paidAt: now, updatedAt: now }).where(eq(invoices.id, invoice.id));
    await tx.update(bookings).set({ paymentStatus: "paid", updatedAt: now }).where(eq(bookings.id, row.bookingId));
  });

  await sendBookingNotification({ memberEmail: invoice.customerEmail, bookingId: row.bookingId, subject: `${invoice.description} · ${invoice.number}`, body: `Payment received for invoice ${invoice.number}. Amount: ${invoice.currency} ${invoice.amount}. Thank you—your receipt is now available in Billing.` });
}

async function handlePaymentFailed(payment?: RazorpayWebhookPayment) {
  if (!payment?.order_id) return;
  const [row] = await db.select().from(payments).where(eq(payments.providerSessionId, payment.order_id)).limit(1);
  if (!row || row.status !== "pending") return;
  await db.update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, row.id));
}

async function handleRefundProcessed(refund?: RazorpayWebhookRefund) {
  if (!refund) return;
  const [row] = await db.select().from(payments).where(and(eq(payments.paymentIntentId, refund.payment_id), eq(payments.status, "refund_processing"))).limit(1);
  if (!row) return;

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "refunded", refundId: refund.id, updatedAt: now }).where(eq(payments.id, row.id));
    await tx.update(invoices).set({ status: "refunded", updatedAt: now }).where(eq(invoices.id, row.invoiceId));
    await tx.update(bookings).set({ paymentStatus: "refunded", updatedAt: now }).where(eq(bookings.id, row.bookingId));
  });
}

async function findSubscriptionWithPlan(razorpaySubscriptionId: string) {
  const [row] = await db.select({ subscription: memberSubscriptions, plan: membershipPlans })
    .from(memberSubscriptions)
    .innerJoin(membershipPlans, eq(memberSubscriptions.planId, membershipPlans.id))
    .where(eq(memberSubscriptions.razorpaySubscriptionId, razorpaySubscriptionId))
    .limit(1);
  return row ?? null;
}

async function syncMemberPlanLabel(memberId: number, label: string) {
  await db.update(memberUsers).set({ plan: label, updatedAt: new Date() }).where(eq(memberUsers.id, memberId));
}

async function handleSubscriptionCharged(subscription?: RazorpayWebhookSubscription, payment?: RazorpayWebhookPayment) {
  if (!subscription) return;
  const found = await findSubscriptionWithPlan(subscription.id);
  if (!found) return;

  const now = new Date();
  const periodStart = subscription.current_start ? new Date(subscription.current_start * 1000) : now;
  const periodEnd = subscription.current_end ? new Date(subscription.current_end * 1000) : null;

  await db.update(memberSubscriptions).set({
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    updatedAt: now,
  }).where(eq(memberSubscriptions.id, found.subscription.id));

  await syncMemberPlanLabel(found.subscription.memberId, found.plan.key);

  if (payment) {
    await db.insert(subscriptionInvoices).values({
      subscriptionId: found.subscription.id,
      memberId: found.subscription.memberId,
      amount: payment.amount != null ? Math.round(payment.amount / 100) : (found.subscription.billingInterval === "yearly" ? found.plan.priceYearly ?? found.plan.priceMonthly : found.plan.priceMonthly),
      currency: payment.currency ?? found.plan.currency,
      status: "paid",
      razorpayPaymentId: payment.id,
      periodStart,
      periodEnd,
    }).onConflictDoNothing({ target: subscriptionInvoices.razorpayPaymentId });
  }
}

async function handleSubscriptionStatus(subscription?: RazorpayWebhookSubscription) {
  if (!subscription) return;
  const found = await findSubscriptionWithPlan(subscription.id);
  if (!found) return;

  const now = new Date();
  await db.update(memberSubscriptions).set({
    status: subscription.status,
    currentPeriodStart: subscription.current_start ? new Date(subscription.current_start * 1000) : found.subscription.currentPeriodStart,
    currentPeriodEnd: subscription.current_end ? new Date(subscription.current_end * 1000) : found.subscription.currentPeriodEnd,
    cancelledAt: terminalSubscriptionStatuses.has(subscription.status) ? now : found.subscription.cancelledAt,
    updatedAt: now,
  }).where(eq(memberSubscriptions.id, found.subscription.id));

  if (terminalSubscriptionStatuses.has(subscription.status)) {
    await syncMemberPlanLabel(found.subscription.memberId, "free");
  } else if (subscription.status === "active") {
    await syncMemberPlanLabel(found.subscription.memberId, found.plan.key);
  }
}
