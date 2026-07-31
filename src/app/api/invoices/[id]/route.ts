import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { invoiceFromSnap, paymentFromSnap } from "@/lib/billing";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { sendBookingNotification } from "@/lib/messaging";
import { getRazorpay } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

class BillingConflictError extends Error {}
class BillingNotFoundError extends Error {}

function invoicesCollection() {
  return db.collection("invoices");
}
function paymentsCollection() {
  return db.collection("payments");
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "billing")) return Response.json({ error: "Billing permission required." }, { status: 403 });
  const { id } = await params;
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

  const invoiceSnap = await invoicesCollection().doc(id).get();
  if (!invoiceSnap.exists) return Response.json({ error: "Invoice not found." }, { status: 404 });
  const invoice = invoiceFromSnap(invoiceSnap);
  const bookingSnap = await db.collection("bookings").doc(invoice.bookingId).get();
  if (!bookingSnap.exists) return Response.json({ error: "Booking not found." }, { status: 404 });
  const booking = bookingSnap.data() as { reference: string; scheduledAt: FirebaseFirestore.Timestamp; status: string; practitionerName: string | null };
  const paymentsSnap = await paymentsCollection().where("invoiceId", "==", invoice.id).orderBy("createdAt", "desc").get();
  const paymentRows = paymentsSnap.docs.map((doc) => paymentFromSnap(doc));

  if (body.action === "mark_paid") {
    await sendBookingNotification({ memberEmail: invoice.customerEmail, bookingId: booking && invoice.bookingId, subject: `${invoice.description} · ${booking.reference}`, body: `Payment received for invoice ${invoice.number}. Amount: ${invoice.currency} ${invoice.amount}. Thank you—your receipt is now available in Billing.` });
    await recordAudit(admin, "invoice.marked_paid", "invoice", invoice.number, { amount: invoice.amount, currency: invoice.currency, provider: "manual" });
  } else if (body.action === "refund") {
    const payment = paymentRows[0];
    await sendBookingNotification({ memberEmail: invoice.customerEmail, bookingId: invoice.bookingId, subject: `${invoice.description} · ${booking.reference}`, body: invoice.status === "refunded" ? `Invoice ${invoice.number} has been refunded in full. Your payment provider may take several days to display the funds.` : `A refund for invoice ${invoice.number} is being processed.` });
    await recordAudit(admin, "invoice.refunded", "invoice", invoice.number, { provider: payment?.provider, refundId: payment?.refundId, status: invoice.status });
  } else {
    await recordAudit(admin, body.action === "void" ? "invoice.voided" : "invoice.reopened", "invoice", invoice.number);
  }

  return Response.json({ ...invoice, bookingReference: booking.reference, scheduledAt: booking.scheduledAt.toDate(), bookingStatus: booking.status, practitionerName: booking.practitionerName, payments: paymentRows });
}

async function lockInvoice(tx: FirebaseFirestore.Transaction, id: string) {
  const ref = invoicesCollection().doc(id);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new BillingNotFoundError("Invoice not found.");
  const invoice = invoiceFromSnap(snap);
  const bookingSnap = await tx.get(db.collection("bookings").doc(invoice.bookingId));
  if (!bookingSnap.exists) throw new BillingNotFoundError("Booking not found.");
  return { ref, invoice, bookingRef: bookingSnap.ref };
}

async function markPaid(id: string) {
  await db.runTransaction(async (tx) => {
    const { ref, invoice, bookingRef } = await lockInvoice(tx, id);
    if (invoice.status === "paid") throw new BillingConflictError("Invoice is already paid.");
    if (invoice.status !== "open") throw new BillingConflictError("This invoice cannot be collected.");
    const now = FieldValue.serverTimestamp();
    tx.set(paymentsCollection().doc(), { invoiceId: invoice.id, bookingId: invoice.bookingId, amount: invoice.amount, currency: invoice.currency, provider: "manual", status: "succeeded", paidAt: now, createdAt: now, updatedAt: now });
    tx.update(ref, { status: "paid", paidAt: now, updatedAt: now });
    tx.update(bookingRef, { paymentStatus: "paid", updatedAt: now });
  });
}

async function changeOpenState(id: string, expected: string, next: string) {
  await db.runTransaction(async (tx) => {
    const { ref, invoice } = await lockInvoice(tx, id);
    if (invoice.status !== expected) throw new BillingConflictError(expected === "open" ? "Only open invoices can be voided." : "Only void invoices can be reopened.");
    tx.update(ref, { status: next, updatedAt: FieldValue.serverTimestamp() });
  });
}

async function refundInvoice(id: string) {
  const claimed = await db.runTransaction(async (tx) => {
    const { ref, invoice, bookingRef } = await lockInvoice(tx, id);
    if (invoice.status !== "paid") throw new BillingConflictError("Only paid invoices can be refunded.");
    const paymentsSnap = await tx.get(paymentsCollection().where("invoiceId", "==", invoice.id).orderBy("createdAt", "desc").limit(1));
    const paymentDoc = paymentsSnap.docs[0];
    const payment = paymentDoc ? paymentFromSnap(paymentDoc) : null;
    if (!payment || payment.status !== "succeeded") throw new BillingConflictError("A refundable payment was not found.");
    const now = FieldValue.serverTimestamp();
    tx.update(ref, { status: "refund_processing", updatedAt: now });
    tx.update(paymentDoc.ref, { status: "refund_processing", updatedAt: now });
    return { ref, invoice, bookingRef, paymentRef: paymentDoc.ref, payment };
  });

  let refundId: string;
  let refundStatus = "processed";
  try {
    if (claimed.payment.provider === "razorpay") {
      const razorpay = getRazorpay();
      if (!razorpay || !claimed.payment.paymentIntentId) throw new Error("Razorpay refund is unavailable for this payment.");
      const refund = await razorpay.payments.refund(claimed.payment.paymentIntentId, {
        amount: Math.round(claimed.invoice.amount * 100),
        notes: {
          invoiceId: claimed.invoice.id,
          bookingId: claimed.invoice.bookingId,
        },
      });
      refundId = refund.id;
      refundStatus = refund.status ?? "processed";
    } else {
      refundId = `manual_${crypto.randomUUID()}`;
    }
  } catch (error) {
    await Promise.all([
      claimed.ref.update({ status: "paid", updatedAt: FieldValue.serverTimestamp() }),
      claimed.paymentRef.update({ status: "succeeded", updatedAt: FieldValue.serverTimestamp() }),
    ]);
    if (error instanceof Error && error.message.startsWith("Razorpay refund")) throw new BillingConflictError(error.message);
    throw error;
  }

  const completed = refundStatus === "processed";
  const now = FieldValue.serverTimestamp();
  await claimed.paymentRef.update({ status: completed ? "refunded" : "refund_pending", refundId, updatedAt: now });
  await claimed.ref.update({ status: completed ? "refunded" : "refund_pending", updatedAt: now });
  if (completed) await claimed.bookingRef.update({ paymentStatus: "refunded", updatedAt: now });
}
