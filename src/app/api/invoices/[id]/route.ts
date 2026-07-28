import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, invoices, payments } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { sendBookingNotification } from "@/lib/messaging";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

class BillingConflictError extends Error {}
class BillingNotFoundError extends Error {}

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "billing")) return Response.json({ error: "Billing permission required." }, { status: 403 });
  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid invoice id." }, { status: 400 });
  const body = await request.json() as { action?: string };
  if (!["mark_paid", "refund", "void", "reopen"].includes(body.action ?? "")) return Response.json({ error: "Unknown invoice action." }, { status: 400 });

  try {
    if (body.action === "mark_paid") await markPaid(id);
    if (body.action === "void") await changeOpenState(id, "open", "void");
    if (body.action === "reopen") await changeOpenState(id, "void", "open");
    if (body.action === "refund") await refundInvoice(id);
  } catch (error) {
    if (error instanceof BillingNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof BillingConflictError) return Response.json({ error: error.message }, { status: 409 });
    console.error("Invoice action failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Invoice action could not be completed." }, { status: 500 });
  }

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) return Response.json({ error: "Invoice not found." }, { status: 404 });
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, invoice.bookingId)).limit(1);
  if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });
  const paymentRows = await db.select().from(payments).where(eq(payments.invoiceId, invoice.id)).orderBy(desc(payments.createdAt));

  if (body.action === "mark_paid") {
    await sendBookingNotification({ memberEmail: invoice.customerEmail, bookingId: booking.id, subject: `${booking.serviceTitle} · ${booking.reference}`, body: `Payment received for invoice ${invoice.number}. Amount: ${invoice.currency} ${invoice.amount}. Thank you—your receipt is now available in Billing.` });
    await recordAudit(admin, "invoice.marked_paid", "invoice", invoice.number, { amount: invoice.amount, currency: invoice.currency, provider: "manual" });
  } else if (body.action === "refund") {
    const payment = paymentRows[0];
    await sendBookingNotification({ memberEmail: invoice.customerEmail, bookingId: booking.id, subject: `${booking.serviceTitle} · ${booking.reference}`, body: invoice.status === "refunded" ? `Invoice ${invoice.number} has been refunded in full. Your payment provider may take several days to display the funds.` : `A refund for invoice ${invoice.number} is being processed.` });
    await recordAudit(admin, "invoice.refunded", "invoice", invoice.number, { provider: payment?.provider, refundId: payment?.refundId, status: invoice.status });
  } else {
    await recordAudit(admin, body.action === "void" ? "invoice.voided" : "invoice.reopened", "invoice", invoice.number);
  }

  return Response.json({ ...invoice, bookingReference: booking.reference, scheduledAt: booking.scheduledAt, bookingStatus: booking.status, practitionerName: booking.practitionerName, payments: paymentRows });
}

async function lockInvoice(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(${1_000_000_000 + id})`);
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) throw new BillingNotFoundError("Invoice not found.");
  const [booking] = await tx.select().from(bookings).where(eq(bookings.id, invoice.bookingId)).limit(1);
  if (!booking) throw new BillingNotFoundError("Booking not found.");
  return { invoice, booking };
}

async function markPaid(id: number) {
  await db.transaction(async (tx) => {
    const { invoice, booking } = await lockInvoice(tx, id);
    if (invoice.status === "paid") throw new BillingConflictError("Invoice is already paid.");
    if (invoice.status !== "open") throw new BillingConflictError("This invoice cannot be collected.");
    const now = new Date();
    await tx.insert(payments).values({ invoiceId: invoice.id, bookingId: booking.id, amount: invoice.amount, currency: invoice.currency, provider: "manual", status: "succeeded", paidAt: now });
    await tx.update(invoices).set({ status: "paid", paidAt: now, updatedAt: now }).where(eq(invoices.id, invoice.id));
    await tx.update(bookings).set({ paymentStatus: "paid", updatedAt: now }).where(eq(bookings.id, booking.id));
  });
}

async function changeOpenState(id: number, expected: string, next: string) {
  await db.transaction(async (tx) => {
    const { invoice } = await lockInvoice(tx, id);
    if (invoice.status !== expected) throw new BillingConflictError(expected === "open" ? "Only open invoices can be voided." : "Only void invoices can be reopened.");
    await tx.update(invoices).set({ status: next, updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
  });
}

async function refundInvoice(id: number) {
  const claimed = await db.transaction(async (tx) => {
    const { invoice, booking } = await lockInvoice(tx, id);
    if (invoice.status !== "paid") throw new BillingConflictError("Only paid invoices can be refunded.");
    const [payment] = await tx.select().from(payments).where(eq(payments.invoiceId, invoice.id)).orderBy(desc(payments.createdAt)).limit(1);
    if (!payment || payment.status !== "succeeded") throw new BillingConflictError("A refundable payment was not found.");
    const now = new Date();
    await tx.update(invoices).set({ status: "refund_processing", updatedAt: now }).where(eq(invoices.id, invoice.id));
    await tx.update(payments).set({ status: "refund_processing", updatedAt: now }).where(eq(payments.id, payment.id));
    return { invoice, booking, payment };
  });

  let refundId: string;
  let refundStatus = "succeeded";
  try {
    if (claimed.payment.provider === "stripe") {
      const stripe = getStripe();
      if (!stripe || !claimed.payment.paymentIntentId) throw new Error("Stripe refund is unavailable for this payment.");
      const refund = await stripe.refunds.create({ payment_intent: claimed.payment.paymentIntentId, reason: "requested_by_customer", metadata: { invoiceId: String(claimed.invoice.id), bookingId: String(claimed.booking.id) } }, { idempotencyKey: `invoice-refund-${claimed.invoice.id}` });
      refundId = refund.id;
      refundStatus = refund.status ?? "pending";
    } else {
      refundId = `manual_${crypto.randomUUID()}`;
    }
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx.update(invoices).set({ status: "paid", updatedAt: new Date() }).where(eq(invoices.id, claimed.invoice.id));
      await tx.update(payments).set({ status: "succeeded", updatedAt: new Date() }).where(eq(payments.id, claimed.payment.id));
    });
    if (error instanceof Error && error.message.startsWith("Stripe refund")) throw new BillingConflictError(error.message);
    throw error;
  }

  const completed = refundStatus === "succeeded";
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: completed ? "refunded" : "refund_pending", refundId, updatedAt: now }).where(eq(payments.id, claimed.payment.id));
    await tx.update(invoices).set({ status: completed ? "refunded" : "refund_pending", updatedAt: now }).where(eq(invoices.id, claimed.invoice.id));
    if (completed) await tx.update(bookings).set({ paymentStatus: "refunded", updatedAt: now }).where(eq(bookings.id, claimed.booking.id));
  });
}
