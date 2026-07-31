import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { invoiceFromSnap, paymentFromSnap } from "@/lib/billing";
import { sendBookingNotification } from "@/lib/messaging";
import { getCurrentMember } from "@/lib/member-auth";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

type VerifyPayload = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const { id } = await params;

  const body = (await request.json()) as VerifyPayload;
  const orderId = body.razorpay_order_id?.trim();
  const paymentId = body.razorpay_payment_id?.trim();
  const signature = body.razorpay_signature?.trim();
  if (!orderId || !paymentId || !signature) return Response.json({ error: "Payment confirmation was incomplete." }, { status: 400 });

  const invoiceSnap = await db.collection("invoices").doc(id).get();
  if (!invoiceSnap.exists) return Response.json({ error: "Invoice not found." }, { status: 404 });
  const invoice = invoiceFromSnap(invoiceSnap);
  if (invoice.memberId !== member.id && invoice.customerEmail !== member.email) {
    return Response.json({ error: "Invoice not found." }, { status: 404 });
  }

  const paymentQuery = db.collection("payments").where("invoiceId", "==", id).where("providerSessionId", "==", orderId).limit(1);
  const paymentSnap = await paymentQuery.get();
  if (paymentSnap.empty) return Response.json({ error: "No matching payment attempt was found for this invoice." }, { status: 404 });
  const payment = paymentFromSnap(paymentSnap.docs[0]);
  if (payment.status === "succeeded") return Response.json({ ok: true, alreadyPaid: true });

  if (!verifyRazorpayPaymentSignature(orderId, paymentId, signature)) {
    return Response.json({ error: "Payment signature could not be verified." }, { status: 400 });
  }

  const bookingRef = db.collection("bookings").doc(invoice.bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) return Response.json({ error: "Booking not found." }, { status: 404 });
  const booking = { id: bookingSnap.id, ...(bookingSnap.data() as { serviceTitle: string; reference: string }) };

  const paymentRef = paymentSnap.docs[0].ref;
  const invoiceRef = invoiceSnap.ref;
  await db.runTransaction(async (tx) => {
    const now = FieldValue.serverTimestamp();
    tx.update(paymentRef, { status: "succeeded", paymentIntentId: paymentId, paidAt: now, updatedAt: now });
    tx.update(invoiceRef, { status: "paid", paidAt: now, updatedAt: now });
    tx.update(bookingRef, { paymentStatus: "paid", updatedAt: now });
  });

  await sendBookingNotification({
    memberEmail: invoice.customerEmail,
    bookingId: booking.id,
    subject: `${booking.serviceTitle} · ${booking.reference}`,
    body: `Payment received for invoice ${invoice.number}. Amount: ${invoice.currency} ${invoice.amount}. Thank you—your receipt is now available in Billing.`,
  });

  return Response.json({ ok: true });
}
