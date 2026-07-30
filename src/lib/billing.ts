import "server-only";

import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, invoices, memberUsers, payments, type Booking } from "@/db/schema";
import { getStudioSettings } from "@/lib/studio-settings";
import { splitGstInclusive } from "@/lib/gst";

export type BillingInvoice = typeof invoices.$inferSelect & {
  bookingReference: string;
  scheduledAt: Date;
  bookingStatus: string;
  practitionerName: string | null;
  payments: Array<typeof payments.$inferSelect>;
};

function invoiceNumber(booking: Pick<Booking, "id" | "createdAt">) {
  const year = booking.createdAt.getUTCFullYear();
  return `INV-${year}-${String(booking.id).padStart(6, "0")}`;
}

export async function ensureInvoiceForBooking(booking: Booking, memberId?: number | null) {
  const settings = await getStudioSettings();
  const { subtotal, taxAmount } = splitGstInclusive(booking.servicePrice, settings.gstRate);
  await db.insert(invoices).values({
    number: invoiceNumber(booking),
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
    status: booking.paymentStatus === "paid" ? "paid" : booking.paymentStatus === "refunded" ? "refunded" : "open",
    dueAt: booking.scheduledAt,
    paidAt: booking.paymentStatus === "paid" ? booking.updatedAt : null,
  }).onConflictDoNothing({ target: invoices.bookingId });
  const [invoice] = await db.select().from(invoices).where(eq(invoices.bookingId, booking.id)).limit(1);
  return invoice;
}

export async function backfillInvoices() {
  const bookingRows = await db.select().from(bookings).orderBy(asc(bookings.id));
  if (!bookingRows.length) return;
  const [existing, members, settings] = await Promise.all([
    db.select({ bookingId: invoices.bookingId }).from(invoices),
    db.select({ id: memberUsers.id, email: memberUsers.email }).from(memberUsers),
    getStudioSettings(),
  ]);
  const existingIds = new Set(existing.map((row) => row.bookingId));
  const memberByEmail = new Map(members.map((member) => [member.email, member.id]));
  const missing = bookingRows.filter((booking) => !existingIds.has(booking.id)).map((booking) => {
    const { subtotal, taxAmount } = splitGstInclusive(booking.servicePrice, settings.gstRate);
    return {
      number: invoiceNumber(booking),
      bookingId: booking.id,
      memberId: memberByEmail.get(booking.clientEmail) ?? null,
      customerName: booking.clientName,
      customerEmail: booking.clientEmail,
      description: booking.serviceTitle,
      subtotal,
      taxRate: settings.gstRate,
      taxAmount,
      amount: booking.servicePrice,
      currency: settings.currency,
      status: booking.paymentStatus === "paid" ? "paid" : booking.paymentStatus === "refunded" ? "refunded" : "open",
      dueAt: booking.scheduledAt,
      paidAt: booking.paymentStatus === "paid" ? booking.updatedAt : null,
    };
  });
  for (let index = 0; index < missing.length; index += 500) {
    await db.insert(invoices).values(missing.slice(index, index + 500)).onConflictDoNothing({ target: invoices.bookingId });
  }
}

async function attachBilling(rows: Array<typeof invoices.$inferSelect>): Promise<BillingInvoice[]> {
  if (!rows.length) return [];
  const bookingRows = await db.select({ id: bookings.id, reference: bookings.reference, scheduledAt: bookings.scheduledAt, status: bookings.status, practitionerName: bookings.practitionerName }).from(bookings).where(inArray(bookings.id, rows.map((row) => row.bookingId)));
  const paymentRows = await db.select().from(payments).where(inArray(payments.invoiceId, rows.map((row) => row.id))).orderBy(desc(payments.createdAt));
  return rows.map((invoice) => {
    const booking = bookingRows.find((row) => row.id === invoice.bookingId);
    return {
      ...invoice,
      bookingReference: booking?.reference ?? "Archived",
      scheduledAt: booking?.scheduledAt ?? invoice.dueAt,
      bookingStatus: booking?.status ?? "archived",
      practitionerName: booking?.practitionerName ?? null,
      payments: paymentRows.filter((row) => row.invoiceId === invoice.id),
    };
  });
}

export async function getAdminBilling() {
  await backfillInvoices();
  return attachBilling(await db.select().from(invoices).orderBy(desc(invoices.createdAt)));
}

export async function getMemberBilling(memberId: number, email: string) {
  await backfillInvoices();
  const rows = await db.select().from(invoices).where(eq(invoices.customerEmail, email)).orderBy(desc(invoices.createdAt));
  return attachBilling(rows.filter((row) => row.memberId === memberId || row.customerEmail === email));
}
