import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { db } from "@/lib/firestore";
import { getRazorpay } from "@/lib/razorpay";
import { invoiceFromSnap, paymentFromSnap, type Invoice, type Payment } from "@/lib/billing";
import {
  changeInvoiceStateInSupabase,
  claimInvoiceRefundInSupabase,
  completeInvoiceRefundInSupabase,
  confirmInvoicePaymentInSupabase,
  getInvoiceByIdInSupabase,
  getInvoiceDetailInSupabase,
  getPaymentBySessionIdInSupabase,
  getPendingPaymentForInvoiceInSupabase,
  insertPendingPaymentInSupabase,
  markInvoicePaidInSupabase,
  rollbackInvoiceRefundInSupabase,
  type InvoiceActionFailure,
  type InvoiceActionResult,
} from "@/lib/billing-supabase";
import { InvoiceConflictError, InvoiceNotFoundError } from "@/lib/invoice-errors";
import { query } from "@/lib/postgres";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

/**
 * Invoice actions, for both providers.
 *
 * Extracted from the three invoice routes because the parts that matter —
 * marking paid, voiding, refunding, confirming a Razorpay payment — are all
 * read-check-write against an invoice, and a transaction cannot be tested from a
 * route handler. Auth, signature verification, audit records and notifications
 * stay in the routes.
 *
 * Every failure is one of the two errors in `invoice-errors.ts`. The messages are
 * assembled here rather than in `billing-supabase.ts`, so the Postgres path and
 * the Firestore path cannot drift on wording: the twin reports a code, and this
 * file owns the text.
 */

export { InvoiceConflictError, InvoiceNotFoundError };

function fail(code: InvoiceActionFailure, conflictMessage: string): never {
  switch (code) {
    case "invoice_not_found":
    case "booking_not_found":
      throw new InvoiceNotFoundError(code === "invoice_not_found" ? "Invoice not found." : "Booking not found.");
    case "already_paid":
      throw new InvoiceConflictError("Invoice is already paid.");
    case "not_open":
      throw new InvoiceConflictError("This invoice cannot be collected.");
    case "wrong_state":
      throw new InvoiceConflictError(conflictMessage);
    case "not_paid":
      throw new InvoiceConflictError("Only paid invoices can be refunded.");
    case "no_refundable_payment":
      throw new InvoiceConflictError("A refundable payment was not found.");
  }
}

/** Marks an invoice paid by hand, recording a manual payment against it. */
export async function markInvoicePaid(id: string): Promise<void> {
  if (isSupabaseCutoverActive()) {
    const result = await markInvoicePaidInSupabase(id);
    if (!result.ok) fail(result.code, "");
    return;
  }

  await db.runTransaction(async (tx) => {
    const { ref, invoice, bookingRef } = await lockInvoice(tx, id);
    if (invoice.status === "paid") throw new InvoiceConflictError("Invoice is already paid.");
    if (invoice.status !== "open") throw new InvoiceConflictError("This invoice cannot be collected.");
    const now = FieldValue.serverTimestamp();
    tx.set(db.collection("payments").doc(), {
      invoiceId: invoice.id, bookingId: invoice.bookingId, amount: invoice.amount,
      currency: invoice.currency, provider: "manual", status: "succeeded",
      paidAt: now, createdAt: now, updatedAt: now,
    });
    tx.update(ref, { status: "paid", paidAt: now, updatedAt: now });
    tx.update(bookingRef, { paymentStatus: "paid", updatedAt: now });
  });
}

/** Voids an open invoice, or reopens a void one. */
export async function changeInvoiceOpenState(id: string, expected: string, next: string): Promise<void> {
  const message = expected === "open" ? "Only open invoices can be voided." : "Only void invoices can be reopened.";
  if (isSupabaseCutoverActive()) {
    const result = await changeInvoiceStateInSupabase(id, expected, next);
    if (!result.ok) fail(result.code, message);
    return;
  }

  await db.runTransaction(async (tx) => {
    const { ref, invoice } = await lockInvoice(tx, id);
    if (invoice.status !== expected) throw new InvoiceConflictError(message);
    tx.update(ref, { status: next, updatedAt: FieldValue.serverTimestamp() });
  });
}

/**
 * Refunds an invoice.
 *
 * The claim comes first and is what stops a double-click from issuing two real
 * refunds: only the caller that moves the invoice out of `paid` gets as far as
 * Razorpay. If the provider call fails, the claim is rolled back so the invoice
 * is collectable again rather than stranded in `refund_processing`.
 */
export async function refundInvoice(id: string): Promise<void> {
  if (isSupabaseCutoverActive()) {
    const claim = await claimInvoiceRefundInSupabase(id);
    if (!claim.ok) fail(claim.code, "");

    let refundId: string;
    let refundStatus = "processed";
    try {
      if (claim.value.payment.provider === "razorpay") {
        const razorpay = getRazorpay();
        if (!razorpay || !claim.value.payment.paymentIntentId) {
          throw new Error("Razorpay refund is unavailable for this payment.");
        }
        const refund = await razorpay.payments.refund(claim.value.payment.paymentIntentId, {
          amount: Math.round(claim.value.invoice.amount * 100),
          notes: { invoiceId: claim.value.invoice.id, bookingId: claim.value.invoice.bookingId },
        });
        refundId = refund.id;
        refundStatus = refund.status ?? "processed";
      } else {
        refundId = `manual_${crypto.randomUUID()}`;
      }
    } catch (error) {
      await rollbackInvoiceRefundInSupabase(claim.value.invoice.id, claim.value.payment.id);
      if (error instanceof Error && error.message.startsWith("Razorpay refund")) {
        throw new InvoiceConflictError(error.message);
      }
      throw error;
    }

    await completeInvoiceRefundInSupabase(
      claim.value.invoice.id,
      claim.value.payment.id,
      claim.value.invoice.bookingId,
      refundId,
      refundStatus === "processed",
    );
    return;
  }

  const claimed = await db.runTransaction(async (tx) => {
    const { ref, invoice, bookingRef } = await lockInvoice(tx, id);
    if (invoice.status !== "paid") throw new InvoiceConflictError("Only paid invoices can be refunded.");
    const paymentsSnap = await tx.get(
      db.collection("payments").where("invoiceId", "==", invoice.id).where("status", "==", "succeeded").orderBy("createdAt", "desc").limit(1),
    );
    const paymentDoc = paymentsSnap.docs[0];
    const payment = paymentDoc ? paymentFromSnap(paymentDoc) : null;
    if (!payment) throw new InvoiceConflictError("A refundable payment was not found.");
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
      if (!razorpay || !claimed.payment.paymentIntentId) {
        throw new Error("Razorpay refund is unavailable for this payment.");
      }
      const refund = await razorpay.payments.refund(claimed.payment.paymentIntentId, {
        amount: Math.round(claimed.invoice.amount * 100),
        notes: { invoiceId: claimed.invoice.id, bookingId: claimed.invoice.bookingId },
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
    if (error instanceof Error && error.message.startsWith("Razorpay refund")) {
      throw new InvoiceConflictError(error.message);
    }
    throw error;
  }

  const completed = refundStatus === "processed";
  const now = FieldValue.serverTimestamp();
  await claimed.paymentRef.update({ status: completed ? "refunded" : "refund_pending", refundId, updatedAt: now });
  await claimed.ref.update({ status: completed ? "refunded" : "refund_pending", updatedAt: now });
  if (completed) await claimed.bookingRef.update({ paymentStatus: "refunded", updatedAt: now });
}

export type InvoiceDetail = {
  invoice: Invoice;
  booking: { reference: string; scheduledAt: Date; status: string; practitionerName: string | null };
  payments: Payment[];
};

/** The invoice with its booking summary and payments, for the admin response. */
export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  if (isSupabaseCutoverActive()) {
    const detail = await getInvoiceDetailInSupabase(id);
    if (!detail) return null;
    return {
      invoice: detail.invoice,
      booking: detail.booking,
      payments: detail.payments,
    };
  }

  const snap = await db.collection("invoices").doc(id).get();
  if (!snap.exists) return null;
  const invoice = invoiceFromSnap(snap);
  const bookingSnap = await db.collection("bookings").doc(invoice.bookingId).get();
  if (!bookingSnap.exists) return null;
  const data = bookingSnap.data() as { reference: string; scheduledAt: FirebaseFirestore.Timestamp; status: string; practitionerName: string | null };
  const paymentsSnap = await db.collection("payments").where("invoiceId", "==", invoice.id).orderBy("createdAt", "desc").get();
  return {
    invoice,
    booking: {
      reference: data.reference,
      scheduledAt: data.scheduledAt.toDate(),
      status: data.status,
      practitionerName: data.practitionerName ?? null,
    },
    payments: paymentsSnap.docs.map((doc) => paymentFromSnap(doc)),
  };
}

/** Reads an invoice for a checkout or verify request. */
export async function getInvoiceById(id: string): Promise<Invoice | null> {
  if (isSupabaseCutoverActive()) return getInvoiceByIdInSupabase(id);
  const snap = await db.collection("invoices").doc(id).get();
  return snap.exists ? invoiceFromSnap(snap) : null;
}

/** The booking's id and status, which checkout needs to refuse a cancelled one. */
export async function getBookingForInvoice(bookingId: string): Promise<{ id: string; status: string; serviceTitle: string; reference: string } | null> {
  if (isSupabaseCutoverActive()) {
    const rows = await query<{ id: string; status: string | null; service_title: string | null; reference: string | null }>(
      `select id, status, service_title, reference from public.bookings where id = $1`,
      [bookingId],
    );
    const row = rows.rows[0];
    if (!row) return null;
    return { id: row.id, status: row.status ?? "", serviceTitle: row.service_title ?? "", reference: row.reference ?? "" };
  }
  const snap = await db.collection("bookings").doc(bookingId).get();
  if (!snap.exists) return null;
  const data = snap.data() as { status: string; serviceTitle: string; reference: string };
  return { id: snap.id, status: data.status, serviceTitle: data.serviceTitle, reference: data.reference };
}

/** A still-pending Razorpay order for this invoice that can be reused. */
export async function getReusablePendingPayment(invoiceId: string): Promise<{ providerSessionId: string | null; createdAt: Date } | null> {
  if (isSupabaseCutoverActive()) {
    const payment = await getPendingPaymentForInvoiceInSupabase(invoiceId);
    return payment ? { providerSessionId: payment.providerSessionId, createdAt: payment.createdAt } : null;
  }
  const snap = await db.collection("payments")
    .where("invoiceId", "==", invoiceId).where("status", "==", "pending")
    .orderBy("createdAt", "desc").limit(1).get();
  const data = snap.docs[0]?.data() as { providerSessionId?: string; createdAt?: FirebaseFirestore.Timestamp } | undefined;
  if (!data) return null;
  return { providerSessionId: data.providerSessionId ?? null, createdAt: data.createdAt?.toDate() ?? new Date(0) };
}

/** Records the Razorpay order created for an invoice. */
export async function recordPendingPayment(values: {
  invoiceId: string;
  bookingId: string;
  amount: number;
  currency: string;
  providerSessionId: string;
}): Promise<void> {
  if (isSupabaseCutoverActive()) {
    await insertPendingPaymentInSupabase(values);
    return;
  }
  await db.collection("payments").add({
    invoiceId: values.invoiceId,
    bookingId: values.bookingId,
    amount: values.amount,
    currency: values.currency,
    provider: "razorpay",
    status: "pending",
    providerSessionId: values.providerSessionId,
    paymentIntentId: null,
    refundId: null,
    paidAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** The payment attempt a Razorpay callback refers to, or null. */
export async function getPaymentForOrder(invoiceId: string, providerSessionId: string): Promise<Payment | null> {
  if (isSupabaseCutoverActive()) return getPaymentBySessionIdInSupabase(invoiceId, providerSessionId);
  const snap = await db.collection("payments")
    .where("invoiceId", "==", invoiceId).where("providerSessionId", "==", providerSessionId).limit(1).get();
  return snap.empty ? null : paymentFromSnap(snap.docs[0]);
}

/** Applies a signature-verified payment across the payment, invoice and booking. */
export async function confirmInvoicePayment(values: {
  paymentId: string;
  invoiceId: string;
  bookingId: string;
  paymentIntentId: string;
}): Promise<void> {
  if (isSupabaseCutoverActive()) {
    await confirmInvoicePaymentInSupabase(values);
    return;
  }
  await db.runTransaction(async (tx) => {
    const now = FieldValue.serverTimestamp();
    tx.update(db.collection("payments").doc(values.paymentId), {
      status: "succeeded", paymentIntentId: values.paymentIntentId, paidAt: now, updatedAt: now,
    });
    tx.update(db.collection("invoices").doc(values.invoiceId), { status: "paid", paidAt: now, updatedAt: now });
    tx.update(db.collection("bookings").doc(values.bookingId), { paymentStatus: "paid", updatedAt: now });
  });
}

async function lockInvoice(tx: FirebaseFirestore.Transaction, id: string) {
  const ref = db.collection("invoices").doc(id);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new InvoiceNotFoundError("Invoice not found.");
  const invoice = invoiceFromSnap(snap);
  const bookingSnap = await tx.get(db.collection("bookings").doc(invoice.bookingId));
  if (!bookingSnap.exists) throw new InvoiceNotFoundError("Booking not found.");
  return { ref, invoice, bookingRef: bookingSnap.ref };
}
