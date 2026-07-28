import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, invoices, payments, stripeEvents } from "@/db/schema";
import { sendBookingNotification } from "@/lib/messaging";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) return Response.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  const [claimed] = await db.insert(stripeEvents).values({ stripeEventId: event.id, type: event.type }).onConflictDoNothing({ target: stripeEvents.stripeEventId }).returning({ id: stripeEvents.id });
  if (!claimed) return Response.json({ received: true, duplicate: true });

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") await fulfillSession(session);
    } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await db.update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.providerSessionId, session.id));
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (intentId) await fulfillRefund(intentId, charge.refunds?.data.at(-1)?.id ?? null);
    }
  } catch (error) {
    await db.delete(stripeEvents).where(eq(stripeEvents.id, claimed.id));
    console.error("Stripe webhook processing failed", error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
  return Response.json({ received: true });
}

async function fulfillSession(session: Stripe.Checkout.Session) {
  const [payment] = await db.select().from(payments).where(eq(payments.providerSessionId, session.id)).limit(1);
  if (!payment || payment.status === "succeeded") return;
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).limit(1);
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, payment.bookingId)).limit(1);
  if (!invoice || !booking) return;
  const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "succeeded", paymentIntentId: intentId, paidAt: now, updatedAt: now }).where(eq(payments.id, payment.id));
    await tx.update(invoices).set({ status: "paid", paidAt: now, updatedAt: now }).where(eq(invoices.id, invoice.id));
    await tx.update(bookings).set({ paymentStatus: "paid", updatedAt: now }).where(eq(bookings.id, booking.id));
  });
  await sendBookingNotification({ memberEmail: invoice.customerEmail, bookingId: booking.id, subject: `${booking.serviceTitle} · ${booking.reference}`, body: `Online payment received for invoice ${invoice.number}. Amount: ${invoice.currency} ${invoice.amount}. Your receipt is available in Billing.` });
}

async function fulfillRefund(paymentIntentId: string, refundId: string | null) {
  const [payment] = await db.select().from(payments).where(eq(payments.paymentIntentId, paymentIntentId)).limit(1);
  if (!payment || payment.status === "refunded") return;
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).limit(1);
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, payment.bookingId)).limit(1);
  if (!invoice || !booking) return;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "refunded", refundId, updatedAt: now }).where(eq(payments.id, payment.id));
    await tx.update(invoices).set({ status: "refunded", updatedAt: now }).where(eq(invoices.id, invoice.id));
    await tx.update(bookings).set({ paymentStatus: "refunded", updatedAt: now }).where(eq(bookings.id, booking.id));
  });
  await sendBookingNotification({ memberEmail: invoice.customerEmail, bookingId: booking.id, subject: `${booking.serviceTitle} · ${booking.reference}`, body: `Invoice ${invoice.number} has been refunded. Your payment provider may take several days to display the funds.` });
}
