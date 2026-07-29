import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { bookings, invoices, payments } from "@/db/schema";
import { sendBookingNotification } from "@/lib/messaging";
import { getCurrentMember } from "@/lib/member-auth";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

type VerifyPayload = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid invoice id." }, { status: 400 });

  const body = (await request.json()) as VerifyPayload;
  const orderId = body.razorpay_order_id?.trim();
  const paymentId = body.razorpay_payment_id?.trim();
  const signature = body.razorpay_signature?.trim();
  if (!orderId || !paymentId || !signature) return Response.json({ error: "Payment confirmation was incomplete." }, { status: 400 });

  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, id), or(eq(invoices.memberId, member.id), eq(invoices.customerEmail, member.email)))).limit(1);
  if (!invoice) return Response.json({ error: "Invoice not found." }, { status: 404 });

  const [payment] = await db.select().from(payments).where(and(eq(payments.invoiceId, id), eq(payments.providerSessionId, orderId))).limit(1);
  if (!payment) return Response.json({ error: "No matching payment attempt was found for this invoice." }, { status: 404 });
  if (payment.status === "succeeded") return Response.json({ ok: true, alreadyPaid: true });

  if (!verifyRazorpayPaymentSignature(orderId, paymentId, signature)) {
    return Response.json({ error: "Payment signature could not be verified." }, { status: 400 });
  }

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, invoice.bookingId)).limit(1);
  if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "succeeded", paymentIntentId: paymentId, paidAt: now, updatedAt: now }).where(eq(payments.id, payment.id));
    await tx.update(invoices).set({ status: "paid", paidAt: now, updatedAt: now }).where(eq(invoices.id, invoice.id));
    await tx.update(bookings).set({ paymentStatus: "paid", updatedAt: now }).where(eq(bookings.id, booking.id));
  });

  await sendBookingNotification({ memberEmail: invoice.customerEmail, bookingId: booking.id, subject: `${booking.serviceTitle} · ${booking.reference}`, body: `Payment received for invoice ${invoice.number}. Amount: ${invoice.currency} ${invoice.amount}. Thank you—your receipt is now available in Billing.` });

  return Response.json({ ok: true });
}
