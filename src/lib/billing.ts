import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getStudioSettings } from "@/lib/studio-settings";
import { splitGstInclusive } from "@/lib/gst";

/** The subset of a booking record billing needs. Structurally compatible with the Firestore
 * `BookingRecord` shape produced by the bookings domain (see `src/app/api/bookings/route.ts`) —
 * kept local instead of importing that type so this file doesn't reach into another domain's
 * route module. */
export type BookingForInvoice = {
  id: string;
  clientName: string;
  clientEmail: string;
  serviceTitle: string;
  servicePrice: number;
  paymentStatus: string;
  scheduledAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type Invoice = {
  id: string; // == bookingId
  number: string;
  bookingId: string;
  memberId: string | null;
  customerName: string;
  customerEmail: string;
  description: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  amount: number;
  currency: string;
  status: string;
  dueAt: Date;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Payment = {
  id: string;
  invoiceId: string;
  bookingId: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  providerSessionId: string | null;
  paymentIntentId: string | null;
  refundId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BillingInvoice = Invoice & {
  bookingReference: string;
  scheduledAt: Date;
  bookingStatus: string;
  practitionerName: string | null;
  payments: Payment[];
};

function toDate(value: FirebaseFirestore.Timestamp | Date | undefined | null): Date {
  if (!value) return new Date();
  return value instanceof Date ? value : value.toDate();
}

function invoicesCollection() {
  return db.collection("invoices");
}

function paymentsCollection() {
  return db.collection("payments");
}

export function invoiceFromSnap(snap: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot): Invoice {
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    number: data.number as string,
    bookingId: data.bookingId as string,
    memberId: (data.memberId as string | null) ?? null,
    customerName: data.customerName as string,
    customerEmail: data.customerEmail as string,
    description: data.description as string,
    subtotal: data.subtotal as number,
    taxRate: data.taxRate as number,
    taxAmount: data.taxAmount as number,
    amount: data.amount as number,
    currency: data.currency as string,
    status: data.status as string,
    dueAt: toDate(data.dueAt as FirebaseFirestore.Timestamp),
    paidAt: data.paidAt ? toDate(data.paidAt as FirebaseFirestore.Timestamp) : null,
    createdAt: toDate(data.createdAt as FirebaseFirestore.Timestamp),
    updatedAt: toDate(data.updatedAt as FirebaseFirestore.Timestamp),
  };
}

export function paymentFromSnap(snap: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot): Payment {
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    invoiceId: data.invoiceId as string,
    bookingId: data.bookingId as string,
    amount: data.amount as number,
    currency: data.currency as string,
    provider: (data.provider as string) ?? "manual",
    status: (data.status as string) ?? "pending",
    providerSessionId: (data.providerSessionId as string | null) ?? null,
    paymentIntentId: (data.paymentIntentId as string | null) ?? null,
    refundId: (data.refundId as string | null) ?? null,
    paidAt: data.paidAt ? toDate(data.paidAt as FirebaseFirestore.Timestamp) : null,
    createdAt: toDate(data.createdAt as FirebaseFirestore.Timestamp),
    updatedAt: toDate(data.updatedAt as FirebaseFirestore.Timestamp),
  };
}

/** Deterministic, unique invoice number derived from the (already-unique) booking id, since
 * Firestore ids aren't sequential integers the way the old serial booking id was. */
function invoiceNumber(bookingId: string, createdAt: Date) {
  const year = createdAt.getUTCFullYear();
  const suffix = bookingId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase().padStart(8, "0");
  return `INV-${year}-${suffix}`;
}

function invoiceStatusForBooking(paymentStatus: string) {
  if (paymentStatus === "paid") return "paid";
  if (paymentStatus === "refunded") return "refunded";
  return "open";
}

/** Creates the invoice for a booking if one doesn't already exist. The invoice doc id is the
 * booking id itself — a booking has exactly one invoice, so `create()` (which fails on an
 * existing doc) replaces the old `onConflictDoNothing({ target: invoices.bookingId })` pattern:
 * "does this doc exist" is the idempotency check. */
export async function ensureInvoiceForBooking(booking: BookingForInvoice, memberId?: string | null): Promise<Invoice> {
  const ref = invoicesCollection().doc(booking.id);
  const existing = await ref.get();
  if (!existing.exists) {
    const settings = await getStudioSettings();
    const { subtotal, taxAmount } = splitGstInclusive(booking.servicePrice, settings.gstRate);
    try {
      await ref.create({
        number: invoiceNumber(booking.id, booking.createdAt),
        bookingId: booking.id,
        memberId: memberId ?? null,
        customerName: booking.clientName,
        customerEmail: booking.clientEmail,
        description: booking.serviceTitle,
        subtotal,
        taxRate: settings.gstRate,
        taxAmount,
        amount: booking.servicePrice,
        currency: settings.currency,
        status: invoiceStatusForBooking(booking.paymentStatus),
        dueAt: booking.scheduledAt,
        paidAt: booking.paymentStatus === "paid" ? booking.updatedAt : null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === 6)) throw error;
    }
  }
  const snap = await ref.get();
  return invoiceFromSnap(snap);
}

/** Backfills invoices for any booking that doesn't have one yet. With the doc-id-per-booking
 * design, this is now just "does `invoices/{bookingId}` exist" per booking rather than a bulk
 * anti-join — Firestore has no server-side join, so we page bookings and probe. */
export async function backfillInvoices(): Promise<void> {
  const bookingsSnap = await db.collection("bookings").orderBy("createdAt", "asc").get();
  if (bookingsSnap.empty) return;
  const settings = await getStudioSettings();

  const batches: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
  const docs = bookingsSnap.docs;
  for (let i = 0; i < docs.length; i += 25) batches.push(docs.slice(i, i + 25));

  for (const batch of batches) {
    await Promise.all(batch.map(async (doc) => {
      const ref = invoicesCollection().doc(doc.id);
      const existing = await ref.get();
      if (existing.exists) return;
      const data = doc.data() as Record<string, unknown>;
      const servicePrice = data.servicePrice as number;
      const clientEmail = data.clientEmail as string;
      const paymentStatus = data.paymentStatus as string;
      const createdAt = toDate(data.createdAt as FirebaseFirestore.Timestamp);
      const scheduledAt = toDate(data.scheduledAt as FirebaseFirestore.Timestamp);
      const { subtotal, taxAmount } = splitGstInclusive(servicePrice, settings.gstRate);

      let memberId: string | null = null;
      const memberSnap = await db.collection("members").where("email", "==", clientEmail).limit(1).get();
      if (!memberSnap.empty) memberId = memberSnap.docs[0].id;

      try {
        await ref.create({
          number: invoiceNumber(doc.id, createdAt),
          bookingId: doc.id,
          memberId,
          customerName: data.clientName as string,
          customerEmail: clientEmail,
          description: data.serviceTitle as string,
          subtotal,
          taxRate: settings.gstRate,
          taxAmount,
          amount: servicePrice,
          currency: settings.currency,
          status: invoiceStatusForBooking(paymentStatus),
          dueAt: scheduledAt,
          paidAt: paymentStatus === "paid" ? toDate(data.updatedAt as FirebaseFirestore.Timestamp) : null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === 6)) throw error;
      }
    }));
  }
}

async function attachBilling(invoices: Invoice[]): Promise<BillingInvoice[]> {
  if (!invoices.length) return [];

  const [bookingDocs, paymentSnaps] = await Promise.all([
    Promise.all(invoices.map((invoice) => db.collection("bookings").doc(invoice.bookingId).get())),
    Promise.all(invoices.map((invoice) => paymentsCollection().where("invoiceId", "==", invoice.id).orderBy("createdAt", "desc").get())),
  ]);

  return invoices.map((invoice, index) => {
    const bookingSnap = bookingDocs[index];
    const bookingData = bookingSnap.exists ? (bookingSnap.data() as Record<string, unknown>) : null;
    const payments = paymentSnaps[index].docs.map((doc) => paymentFromSnap(doc));
    return {
      ...invoice,
      bookingReference: (bookingData?.reference as string | undefined) ?? "Archived",
      scheduledAt: bookingData ? toDate(bookingData.scheduledAt as FirebaseFirestore.Timestamp) : invoice.dueAt,
      bookingStatus: (bookingData?.status as string | undefined) ?? "archived",
      practitionerName: (bookingData?.practitionerName as string | null | undefined) ?? null,
      payments,
    };
  });
}

export async function getAdminBilling(): Promise<BillingInvoice[]> {
  await backfillInvoices();
  const snap = await invoicesCollection().orderBy("createdAt", "desc").get();
  return attachBilling(snap.docs.map((doc) => invoiceFromSnap(doc)));
}

export async function getMemberBilling(memberId: string, email: string): Promise<BillingInvoice[]> {
  await backfillInvoices();
  const snap = await invoicesCollection().where("customerEmail", "==", email).orderBy("createdAt", "desc").get();
  const rows = snap.docs.map((doc) => invoiceFromSnap(doc)).filter((row) => row.memberId === memberId || row.customerEmail === email);
  return attachBilling(rows);
}
