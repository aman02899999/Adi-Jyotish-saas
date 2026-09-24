import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { invoiceFromSnap, paymentFromSnap } from "@/lib/billing";
import { getPlanById, type MembershipPlan } from "@/lib/plans";
import { splitGstInclusive } from "@/lib/gst";
import { sendBookingNotification } from "@/lib/messaging";
import { sendEmail, genericNotificationEmailHtml } from "@/lib/email";
import { createNotification, notifyAdmins } from "@/lib/notifications";
import { getSiteUrl } from "@/lib/site-url";
import { isRazorpayWebhookConfigured, verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { processReferralReward } from "@/lib/referrals";
import { getStudioSettings } from "@/lib/studio-settings";
import { rechargeWallet } from "@/lib/wallet";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import {
  completeInvoiceRefundInSupabase,
  confirmInvoicePaymentInSupabase,
  getInvoiceByIdInSupabase,
} from "@/lib/billing-supabase";
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
  type WebhookSubscriptionRow,
} from "@/lib/razorpay-webhook-supabase";

// Razorpay statuses that mean a renewal charge is stuck (failed retries exhausted, or the
// subscription got paused) — the member needs to act, so this is the one subscription-status
// transition worth interrupting them for instead of just updating a record silently.
const DUNNING_STATUSES = new Set(["halted", "paused"]);

// Razorpay retries webhook delivery until it gets a 2xx, so the same "halted"/"paused" event can
// arrive more than once for one dunning episode — guard on a per-member flag (cleared once the
// subscription becomes active again) instead of relying on webhook delivery being exactly-once.
const DUNNING_NOTICE_COOLDOWN_MS = 20 * 60 * 60 * 1000;

async function sendDunningNotice(memberId: string, planName: string) {
  let email: string;
  let name: string | undefined;

  if (isSupabaseCutoverActive()) {
    // The cooldown flag lives on member_subscriptions rather than on the member:
    // there is exactly one subscription row per member (its id IS the member id),
    // so the window behaves the same while sitting next to the subscription it
    // describes. A null return also means there is nothing to dun.
    const state = await getDunningStateInSupabase(memberId);
    if (!state?.email) return;
    const lastSentMs = state.dunningNoticeSentAt?.getTime() ?? 0;
    if (Date.now() - lastSentMs < DUNNING_NOTICE_COOLDOWN_MS) return;
    await markDunningNoticeSentInSupabase(memberId);
    email = state.email;
    name = state.name;
  } else {
    const memberRef = db.collection("members").doc(memberId);
    const memberSnap = await memberRef.get();
    const member = memberSnap.data() as { name?: string; email?: string; dunningNoticeSentAt?: FirebaseFirestore.Timestamp } | undefined;
    if (!member?.email) return;

    const lastSentMs = member.dunningNoticeSentAt?.toMillis() ?? 0;
    if (Date.now() - lastSentMs < DUNNING_NOTICE_COOLDOWN_MS) return;
    await memberRef.update({ dunningNoticeSentAt: FieldValue.serverTimestamp() });
    email = member.email;
    name = member.name;
  }

  const billingUrl = new URL("/dashboard/billing", getSiteUrl()).toString();
  await createNotification({
    recipientType: "member",
    recipientId: memberId,
    type: "subscription_payment_issue",
    title: "Your membership renewal needs attention",
    body: `We couldn't renew your ${planName} membership. Update your payment details to keep your benefits.`,
    link: "/dashboard/billing",
  });
  await sendEmail({
    to: email,
    subject: "Action needed: your membership renewal failed",
    html: genericNotificationEmailHtml({
      title: "Your membership renewal needs attention",
      name: name ?? "there",
      body: `We weren't able to renew your ${planName} membership — this usually means the card on file was declined. Update your payment details to keep your discounts and benefits active.`,
      ctaLabel: "Update payment details",
      ctaUrl: billingUrl,
    }),
  }).catch((error) => console.error("Dunning email failed", error));
}

const PAYMENT_FAILURE_RISK_THRESHOLD = 4;
const PAYMENT_FAILURE_RISK_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Repeated failed charge attempts from the same member in a short window is a common precursor
 * to a chargeback/dispute (a declined card being retried, or a stolen card being tested) — flags
 * it for admin review instead of only finding out after a dispute lands. Uses a single per-member
 * counter doc (reset once the window elapses) rather than a query over a failures collection, so
 * this needs no new composite index and stays a fixed cost per failure event. Only covers flows
 * that stamp notes.memberId on the Razorpay order (wallet recharge, gemstone orders, gift
 * purchases) — booking/subscription payments use a different checkout path and aren't covered. */
async function flagPaymentFailureRisk(memberId: string) {
  let shouldNotify: boolean;

  if (isSupabaseCutoverActive()) {
    // One statement: the CASE reads the row's own window_start, so concurrent
    // failures cannot lose an increment the way a read-then-write would.
    shouldNotify = (await bumpPaymentFailureCounterInSupabase(memberId)) >= PAYMENT_FAILURE_RISK_THRESHOLD;
  } else {
    const ref = db.collection("paymentFailureCounters").doc(memberId);
    shouldNotify = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() as { count?: number; windowStart?: FirebaseFirestore.Timestamp }) : undefined;
      const windowStartMs = data?.windowStart?.toMillis() ?? 0;
      const stillInWindow = Date.now() - windowStartMs < PAYMENT_FAILURE_RISK_WINDOW_MS;
      const count = (stillInWindow ? data?.count ?? 0 : 0) + 1;
      tx.set(ref, { count, windowStart: stillInWindow && data ? data.windowStart : FieldValue.serverTimestamp() }, { merge: true });
      return count >= PAYMENT_FAILURE_RISK_THRESHOLD;
    });
  }
  if (!shouldNotify) return;

  const adminIds = await getAdminIdsWithPermission("billing");
  if (!adminIds.length) return;
  const member = isSupabaseCutoverActive()
    ? await getMemberContactInSupabase(memberId)
    : ((await db.collection("members").doc(memberId).get()).data() as { name?: string; email?: string } | undefined) ?? null;
  await notifyAdmins(adminIds, {
    type: "payment_failure_risk",
    title: `Repeated payment failures: ${member?.name ?? "a member"}`,
    body: `${member?.email ?? memberId} has had ${PAYMENT_FAILURE_RISK_THRESHOLD}+ failed payment attempts in the last 24 hours — worth checking before it becomes a dispute.`,
    link: "/admin/members",
  }).catch((error) => console.error("Payment-failure risk notification failed", error));
}

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
  // Razorpay always sends this header in practice, but the fallback (if it's ever missing) is a
  // hash of the verified body — deterministic, so a genuine retry of the same delivery still
  // dedupes correctly — rather than a timestamp, which would defeat dedup entirely by construction.
  const eventId = request.headers.get("x-razorpay-event-id") || createHash("sha256").update(rawBody).digest("hex");
  const cutover = isSupabaseCutoverActive();

  // Both providers use the event id as the primary key, so the claim is a single
  // insert and the rollback is a single delete — no separate existence read that
  // two concurrent deliveries could both pass.
  const releaseClaim = async () => {
    if (cutover) {
      await releaseRazorpayEventInSupabase(eventId).catch(() => {});
      return;
    }
    await db.collection("razorpayEvents").doc(eventId).delete().catch(() => {});
  };

  if (cutover) {
    const claimed = await claimRazorpayEventInSupabase(eventId, body.event);
    if (!claimed) return Response.json({ ok: true, deduped: true });
  } else {
    try {
      await db.collection("razorpayEvents").doc(eventId).create({ type: body.event, processedAt: FieldValue.serverTimestamp() });
    } catch (error) {
      if (isAlreadyExists(error)) return Response.json({ ok: true, deduped: true });
      throw error;
    }
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
    // The dedup doc was created before the handler ran to lock out concurrent duplicate
    // deliveries — but on genuine failure it has to come back out, or Razorpay's retry of this
    // same event will be deduped away as "already processed" when it never actually completed.
    await releaseClaim();
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return Response.json({ ok: true });
}

async function handlePaymentCaptured(payment?: RazorpayWebhookPayment) {
  if (!payment?.order_id) return;
  const cutover = isSupabaseCutoverActive();

  let paymentId: string | null;
  let paymentStatus: string;
  let invoiceId: string | null;
  let bookingId: string | null;

  if (cutover) {
    const row = await getPaymentByOrderIdInSupabase(payment.order_id);
    paymentId = row?.id ?? null;
    paymentStatus = row?.status ?? "";
    invoiceId = row?.invoiceId ?? null;
    bookingId = row?.bookingId ?? null;
  } else {
    const paymentsSnap = await db.collection("payments").where("providerSessionId", "==", payment.order_id).limit(1).get();
    paymentId = paymentsSnap.empty ? null : paymentsSnap.docs[0].id;
    const parsed = paymentsSnap.empty ? null : paymentFromSnap(paymentsSnap.docs[0]);
    paymentStatus = parsed?.status ?? "";
    invoiceId = parsed?.invoiceId ?? null;
    bookingId = parsed?.bookingId ?? null;
  }

  if (!paymentId) {
    // Wallet recharges are the only flow whose Razorpay order has no matching `payments` doc AND
    // is meant to be actioned here — every other order type (gemstone checkout, subscriptions)
    // also stamps notes.memberId for tracking, so `purpose` is the required discriminator, not
    // just memberId's presence. Without it, a gemstone order payment would silently double as a
    // wallet top-up for the same amount.
    const memberId = payment.notes?.memberId;
    if (memberId && payment.notes?.purpose === "wallet_recharge" && payment.amount != null) {
      const rechargeAmount = Math.round(payment.amount / 100);
      await rechargeWallet({ memberId, amount: rechargeAmount, razorpayPaymentId: payment.id });
      await processReferralReward(memberId, rechargeAmount).catch((error) => console.error("Referral reward processing failed", error));
    }
    return;
  }
  if (paymentStatus === "succeeded") return;

  if (!invoiceId) return;

  // Both providers expose the same display fields, so the notification block below
  // is shared. Deliberately a local: a module-level holder would let two concurrent
  // webhook deliveries overwrite each other's invoice.
  let invoiceView: { id: string; number: string; description: string; currency: string; amount: number; customerName: string; customerEmail: string };
  if (cutover) {
    const invoice = await getInvoiceByIdInSupabase(invoiceId);
    if (!invoice) return;
    if (invoice.status === "paid") return;
    invoiceView = invoice;
  } else {
    const invoiceSnap = await db.collection("invoices").doc(invoiceId).get();
    if (!invoiceSnap.exists) return;
    const firestoreInvoice = invoiceFromSnap(invoiceSnap);
    if (firestoreInvoice.status === "paid") return;
    invoiceView = firestoreInvoice;
  }

  if (cutover) {
    // payments.invoice_id and payments.booking_id are nullable in Postgres; an
    // empty string matches no booking row, which is what the Firestore path did
    // by writing to a document id that did not exist.
    await confirmInvoicePaymentInSupabase({
      paymentId,
      invoiceId,
      bookingId: bookingId ?? "",
      paymentIntentId: payment.id,
    });
  } else {
    const invoiceRef = db.collection("invoices").doc(invoiceId);
    const bookingRef = db.collection("bookings").doc(bookingId ?? "");
    const paymentRef = db.collection("payments").doc(paymentId);
    await db.runTransaction(async (tx) => {
      const now = FieldValue.serverTimestamp();
      tx.update(paymentRef, { status: "succeeded", paymentIntentId: payment.id, paidAt: now, updatedAt: now });
      tx.update(invoiceRef, { status: "paid", paidAt: now, updatedAt: now });
      tx.update(bookingRef, { paymentStatus: "paid", updatedAt: now });
    });
  }

  // Guarded like the email below it: the payment transaction has already committed
  // by this point, so an inbox write that throws would 500 the webhook and have
  // Razorpay retry an event that succeeded. A missing notification is worth logging
  // and moving on; re-processing a captured payment is not.
  await sendBookingNotification({
    memberEmail: invoiceView.customerEmail,
    bookingId: bookingId ?? "",
    subject: `${invoiceView.description} · ${invoiceView.number}`,
    body: `Payment received for invoice ${invoiceView.number}. Amount: ${invoiceView.currency} ${invoiceView.amount}. Thank you—your receipt is now available in Billing.`,
  }).catch((error) => console.error("Booking notification failed", error));
  await sendEmail({
    to: invoiceView.customerEmail,
    subject: `Payment received · ${invoiceView.number}`,
    html: genericNotificationEmailHtml({
      title: "Payment received",
      name: invoiceView.customerName,
      body: `We've received your payment of ${invoiceView.currency} ${invoiceView.amount} for invoice ${invoiceView.number}. Your receipt is ready to download.`,
      ctaLabel: "View receipt",
      ctaUrl: new URL(`/dashboard/billing/${invoiceView.id}`, getSiteUrl()).toString(),
    }),
  }).catch(() => {});
}

async function handlePaymentFailed(payment?: RazorpayWebhookPayment) {
  if (!payment?.order_id) return;
  if (isSupabaseCutoverActive()) {
    const row = await getPaymentByOrderIdInSupabase(payment.order_id);
    // The status guard is inside the update's own predicate, so a late failure
    // event cannot overwrite a payment that has since succeeded.
    if (row) await markPaymentFailedInSupabase(row.id);
  } else {
    const snap = await db.collection("payments").where("providerSessionId", "==", payment.order_id).limit(1).get();
    if (!snap.empty) {
      const row = paymentFromSnap(snap.docs[0]);
      if (row.status === "pending") await snap.docs[0].ref.update({ status: "failed", updatedAt: FieldValue.serverTimestamp() });
    }
  }
  if (payment.notes?.memberId) await flagPaymentFailureRisk(payment.notes.memberId).catch((error) => console.error("Payment-failure risk flag failed", error));
}

async function handleRefundProcessed(refund?: RazorpayWebhookRefund) {
  if (!refund) return;
  // refundInvoice() only leaves a payment in "refund_processing" for the duration of the
  // synchronous Razorpay API call; once that call returns, a non-instant refund settles into
  // "refund_pending" until this webhook confirms it, so that's the state we need to match here.
  if (isSupabaseCutoverActive()) {
    const row = await getRefundablePaymentInSupabase(refund.payment_id);
    if (!row?.invoiceId || !row.bookingId) return;
    await completeInvoiceRefundInSupabase(row.invoiceId, row.id, row.bookingId, refund.id, true);
    return;
  }
  const snap = await db.collection("payments")
    .where("paymentIntentId", "==", refund.payment_id)
    .where("status", "==", "refund_pending")
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

type FoundSubscription =
  | { memberId: string; plan: MembershipPlan; row: WebhookSubscriptionRow; data: null }
  | { memberId: string; plan: MembershipPlan; row: null; data: Record<string, unknown>; ref: FirebaseFirestore.DocumentReference };

async function findSubscriptionWithPlan(razorpaySubscriptionId: string): Promise<FoundSubscription | null> {
  if (isSupabaseCutoverActive()) {
    const row = await findSubscriptionByRazorpayIdInSupabase(razorpaySubscriptionId);
    if (!row) return null;
    const plan = await getPlanById(row.planId);
    if (!plan) return null;
    return { memberId: row.memberId, plan, row, data: null };
  }
  const snap = await db.collection("memberSubscriptions").where("razorpaySubscriptionId", "==", razorpaySubscriptionId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data() as Record<string, unknown>;
  const plan = await getPlanById(data.planId as string);
  if (!plan) return null;
  return { memberId: doc.id, plan, row: null, data, ref: doc.ref };
}

async function syncMemberPlanLabel(memberId: string, label: string) {
  if (isSupabaseCutoverActive()) {
    await syncMemberPlanLabelInSupabase(memberId, label);
    return;
  }
  await db.collection("members").doc(memberId).update({ plan: label, updatedAt: FieldValue.serverTimestamp() });
}

async function handleSubscriptionCharged(subscription?: RazorpayWebhookSubscription, payment?: RazorpayWebhookPayment) {
  if (!subscription) return;
  const found = await findSubscriptionWithPlan(subscription.id);
  if (!found) return;
  const cutover = isSupabaseCutoverActive();

  const now = new Date();
  const periodStart = subscription.current_start ? new Date(subscription.current_start * 1000) : now;
  const periodEnd = subscription.current_end ? new Date(subscription.current_end * 1000) : null;

  if (cutover) {
    await applySubscriptionChargeInSupabase({ memberId: found.memberId, periodStart, periodEnd });
  } else if (found.row === null) {
    await found.ref.update({
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      // A successful renewal charge starts a fresh billing period, so the reminder for the
      // period that just ended needs to be able to fire again ahead of the next one.
      renewalReminderSentAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await syncMemberPlanLabel(found.memberId, found.plan.key);

  if (payment) {
    const billingInterval = (found.row ? found.row.billingInterval : found.data?.billingInterval) as "monthly" | "yearly";
    const amount = payment.amount != null ? Math.round(payment.amount / 100) : (billingInterval === "yearly" ? found.plan.priceYearly ?? found.plan.priceMonthly : found.plan.priceMonthly);
    // Listed prices are GST-inclusive, matching how booking and gemstone invoices already split it.
    const settings = await getStudioSettings();
    const { subtotal, taxAmount } = splitGstInclusive(amount, settings.gstRate);
    if (cutover) {
      // Primary key is the Razorpay payment id, so a replayed charge cannot raise a
      // second invoice for the same payment.
      await insertSubscriptionInvoiceIfAbsentInSupabase({
        paymentId: payment.id,
        memberId: found.memberId,
        amount,
        subtotal,
        taxAmount,
        taxRate: settings.gstRate,
        currency: payment.currency ?? found.plan.currency,
        periodStart,
        periodEnd,
      });
      return;
    }
    // Doc id == razorpayPaymentId: "does this doc exist" replaces onConflictDoNothing on
    // subscriptionInvoices.razorpayPaymentId.
    const invoiceRef = db.collection("subscriptionInvoices").doc(payment.id);
    try {
      await invoiceRef.create({
        subscriptionId: found.memberId,
        memberId: found.memberId,
        amount,
        subtotal,
        taxAmount,
        taxRate: settings.gstRate,
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
  const isTerminal = terminalSubscriptionStatuses.has(subscription.status);

  if (isSupabaseCutoverActive() && found.row) {
    await applySubscriptionStatusInSupabase({
      memberId: found.memberId,
      status: subscription.status,
      // An event that omits a period boundary must not erase the one we hold.
      periodStart: subscription.current_start ? new Date(subscription.current_start * 1000) : found.row.currentPeriodStart,
      periodEnd: subscription.current_end ? new Date(subscription.current_end * 1000) : found.row.currentPeriodEnd,
      cancelledAt: isTerminal ? now : found.row.cancelledAt,
    });
  } else if (found.row === null && found.data) {
    const existingStart = found.data.currentPeriodStart as FirebaseFirestore.Timestamp | undefined;
    const existingEnd = found.data.currentPeriodEnd as FirebaseFirestore.Timestamp | undefined;
    const existingCancelledAt = found.data.cancelledAt as FirebaseFirestore.Timestamp | undefined;

    await found.ref.update({
      status: subscription.status,
      currentPeriodStart: subscription.current_start ? new Date(subscription.current_start * 1000) : (existingStart ?? null),
      currentPeriodEnd: subscription.current_end ? new Date(subscription.current_end * 1000) : (existingEnd ?? null),
      cancelledAt: isTerminal ? now : (existingCancelledAt ?? null),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  if (isTerminal) {
    await syncMemberPlanLabel(found.memberId, "free");
  } else if (subscription.status === "active") {
    await syncMemberPlanLabel(found.memberId, found.plan.key);
  }

  if (DUNNING_STATUSES.has(subscription.status)) {
    await sendDunningNotice(found.memberId, found.plan.name).catch((error) => console.error("Dunning notice failed", error));
  }
}
