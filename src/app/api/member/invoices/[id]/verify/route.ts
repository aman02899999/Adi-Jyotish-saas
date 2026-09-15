import { sendBookingNotification } from "@/lib/messaging";
import { getCurrentMember } from "@/lib/member-auth";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay";
import { confirmInvoicePayment, getBookingForInvoice, getInvoiceById, getPaymentForOrder } from "@/lib/invoice-actions";

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

  const invoice = await getInvoiceById(id);
  if (!invoice) return Response.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.memberId !== member.id && invoice.customerEmail !== member.email) {
    return Response.json({ error: "Invoice not found." }, { status: 404 });
  }

  const payment = await getPaymentForOrder(id, orderId);
  if (!payment) return Response.json({ error: "No matching payment attempt was found for this invoice." }, { status: 404 });
  if (payment.status === "succeeded") return Response.json({ ok: true, alreadyPaid: true });

  if (!verifyRazorpayPaymentSignature(orderId, paymentId, signature)) {
    return Response.json({ error: "Payment signature could not be verified." }, { status: 400 });
  }

  const booking = await getBookingForInvoice(invoice.bookingId);
  if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });

  await confirmInvoicePayment({ paymentId: payment.id, invoiceId: invoice.id, bookingId: booking.id, paymentIntentId: paymentId });

  await sendBookingNotification({
    memberEmail: invoice.customerEmail,
    bookingId: booking.id,
    subject: `${booking.serviceTitle} · ${booking.reference}`,
    body: `Payment received for invoice ${invoice.number}. Amount: ${invoice.currency} ${invoice.amount}. Thank you—your receipt is now available in Billing.`,
  });

  return Response.json({ ok: true });
}
