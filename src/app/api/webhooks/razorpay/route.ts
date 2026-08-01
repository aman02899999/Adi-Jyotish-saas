import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { invoiceFromSnap, paymentFromSnap } from "@/lib/billing";
import { getPlanById, type MembershipPlan } from "@/lib/plans";
import { sendBookingNotification } from "@/lib/messaging";
import { sendEmail, genericNotificationEmailHtml } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
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

function isAlreadyExists(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === 6);
}

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

  // Doc id == the Razorpay event id itself, so "does this doc exist" is the idempotency check —
  // replaces the old unique-constraint-violation-catch pattern on razorpayEvents.razorpayEventId.
  const eventId = request.headers.get("x-razorpay-event-id") || `${body.event}:${rawBody.length}:${Date.now()}`;
  const eventRef = db.collection("razorpayEvents").doc(eventId);
  try {
    await eventRef.create({ type: body.event, processedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    if (isAlreadyExists(error)) return Response.json({ ok: true, deduped: true });
    throw error;
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
  const paymentsSnap = await db.collection("payments").where("providerSessionId", "==", payment.order_id).limit(1).get();
  if (paymentsSnap.empty) {
    // Wallet recharges are the only flow whose Razorpay order has no matching `payments` doc AND
    // is meant to be actioned here — every other order type (gemstone checkout, subscriptions)
    // also stamps notes.memberId for tracking, so `purpose` is the required discriminator, not
    // just memberId's presence. Without it, a gemstone order payment would silently double as a
    // wallet top-up for the same amount.
    const memberId = payment.notes?.memberId;
    if (memberId && payment.notes?.purpose === "wallet_recharge" && payment.amount != null) {
      await rechargeWallet({ memberId, amount: Math.round(payment.amount / 100), razorpayPaymentId: payment.id });
    }
    return;
  }
  const row = paymentFromSnap(paymentsSnap.docs[0]);
  if (row.status === "succeeded") return;

  const invoiceRef = db.collection("invoices").doc(row.invoiceId);
  const invoiceSnap = await invoiceRef.get();
  if (!invoiceSnap.exists) return;
  const invoice = invoiceFromSnap(invoiceSnap);
  if (invoice.status === "paid") return;

  const bookingRef = db.collection("bookings").doc(row.bookingId);
  const paymentRef = paymentsSnap.docs[0].ref;
  await db.runTransaction(async (tx) => {
    const now = FieldValue.serverTimestamp();
    tx.update(paymentRef, { status: "succeeded", paymentIntentId: payment.id, paidAt: now, updatedAt: now });
    tx.update(invoiceRef, { status: "paid", paidAt: now, updatedAt: now });
    tx.update(bookingRef, { paymentStatus: "paid", updatedAt: now });
  });

  await sendBookingNotification({
    memberEmail: invoice.customerEmail,
    bookingId: row.bookingId,
    subject: `${invoice.description} · ${invoice.number}`,
    body: `Payment received for invoice ${invoice.number}. Amount: ${invoice.currency} ${invoice.amount}. Thank you—your receipt is now available in Billing.`,
  });
  await sendEmail({
    to: invoice.customerEmail,
    subject: `Payment received · ${invoice.number}`,
    html: genericNotificationEmailHtml({
      title: "Payment received",
      name: invoice.customerName,
      body: `We've received your payment of ${invoice.currency} ${invoice.amount} for invoice ${invoice.number}. Your receipt is ready to download.`,
      ctaLabel: "View receipt",
      ctaUrl: new URL(`/dashboard/billing/${invoice.id}`, getSiteUrl()).toString(),
    }),
  }).catch(() => {});
}

async function handlePaymentFailed(payment?: RazorpayWebhookPayment) {
  if (!payment?.order_id) return;
  const snap = await db.collection("payments").where("providerSessionId", "==", payment.order_id).limit(1).get();
  if (snap.empty) return;
  const row = paymentFromSnap(snap.docs[0]);
  if (row.status !== "pending") return;
  await snap.docs[0].ref.update({ status: "failed", updatedAt: FieldValue.serverTimestamp() });
}

async function handleRefundProcessed(refund?: RazorpayWebhookRefund) {
  if (!refund) return;
  const snap = await db.collection("payments")
    .where("paymentIntentId", "==", refund.payment_id)
    .where("status", "==", "refund_processing")
    .limit(1)
    .get();
  if (snap.empty) return;
  const row = paymentFromSnap(snap.docs[0]);

  const paymentRef = snap.docs[0].ref;
  const invoiceRef = db.collection("invoices").doc(row.invoiceId);
  const bookingRef = db.collection("bookings").doc(row.bookingId);
  await db.runTransaction(async (tx) => {
    const now = FieldValue.serverTimestamp();
    tx.update(paymentRef, { status: "refunded", refundId: refund.id, updatedAt: now });
    tx.update(invoiceRef, { status: "refunded", updatedAt: now });
    tx.update(bookingRef, { paymentStatus: "refunded", updatedAt: now });
  });
}

async function findSubscriptionWithPlan(razorpaySubscriptionId: string): Promise<{ memberId: string; ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown>; plan: MembershipPlan } | null> {
  const snap = await db.collection("memberSubscriptions").where("razorpaySubscriptionId", "==", razorpaySubscriptionId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data() as Record<string, unknown>;
  const plan = await getPlanById(data.planId as string);
  if (!plan) return null;
  return { memberId: doc.id, ref: doc.ref, data, plan };
}

async function syncMemberPlanLabel(memberId: string, label: string) {
  await db.collection("members").doc(memberId).update({ plan: label, updatedAt: FieldValue.serverTimestamp() });
}

async function handleSubscriptionCharged(subscription?: RazorpayWebhookSubscription, payment?: RazorpayWebhookPayment) {
  if (!subscription) return;
  const found = await findSubscriptionWithPlan(subscription.id);
  if (!found) return;

  const now = new Date();
  const periodStart = subscription.current_start ? new Date(subscription.current_start * 1000) : now;
  const periodEnd = subscription.current_end ? new Date(subscription.current_end * 1000) : null;

  await found.ref.update({
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await syncMemberPlanLabel(found.memberId, found.plan.key);

  if (payment) {
    const billingInterval = found.data.billingInterval as "monthly" | "yearly";
    // Doc id == razorpayPaymentId: "does this doc exist" replaces onConflictDoNothing on
    // subscriptionInvoices.razorpayPaymentId.
    const invoiceRef = db.collection("subscriptionInvoices").doc(payment.id);
    try {
      await invoiceRef.create({
        subscriptionId: found.memberId,
        memberId: found.memberId,
        amount: payment.amount != null ? Math.round(payment.amount / 100) : (billingInterval === "yearly" ? found.plan.priceYearly ?? found.plan.priceMonthly : found.plan.priceMonthly),
        currency: payment.currency ?? found.plan.currency,
        status: "paid",
        razorpayPaymentId: payment.id,
        periodStart,
        periodEnd,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
  }
}

async function handleSubscriptionStatus(subscription?: RazorpayWebhookSubscription) {
  if (!subscription) return;
  const found = await findSubscriptionWithPlan(subscription.id);
  if (!found) return;

  const now = new Date();
  const existingStart = found.data.currentPeriodStart as FirebaseFirestore.Timestamp | undefined;
  const existingEnd = found.data.currentPeriodEnd as FirebaseFirestore.Timestamp | undefined;
  const existingCancelledAt = found.data.cancelledAt as FirebaseFirestore.Timestamp | undefined;

  await found.ref.update({
    status: subscription.status,
    currentPeriodStart: subscription.current_start ? new Date(subscription.current_start * 1000) : (existingStart ?? null),
    currentPeriodEnd: subscription.current_end ? new Date(subscription.current_end * 1000) : (existingEnd ?? null),
    cancelledAt: terminalSubscriptionStatuses.has(subscription.status) ? now : (existingCancelledAt ?? null),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (terminalSubscriptionStatuses.has(subscription.status)) {
    await syncMemberPlanLabel(found.memberId, "free");
  } else if (subscription.status === "active") {
    await syncMemberPlanLabel(found.memberId, found.plan.key);
  }
}
