import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";
import { getBookingForInvoice, getInvoiceById, getReusablePendingPayment, recordPendingPayment } from "@/lib/invoice-actions";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const { id } = await params;

  const invoice = await getInvoiceById(id);
  if (!invoice) return Response.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.memberId !== member.id && invoice.customerEmail !== member.email) {
    return Response.json({ error: "Invoice not found." }, { status: 404 });
  }
  if (invoice.status === "paid") return Response.json({ error: "This invoice is already paid." }, { status: 409 });
  if (["refunded", "void"].includes(invoice.status)) return Response.json({ error: "This invoice cannot be paid." }, { status: 409 });

  const booking = await getBookingForInvoice(invoice.bookingId);
  if (!booking || booking.status === "cancelled") return Response.json({ error: "Cancelled consultations cannot be paid online." }, { status: 409 });

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured. You can still pay through the studio." }, { status: 503 });

  // Reuse a still-fresh in-flight order instead of minting a new one: without this, a customer
  // whose payment succeeded but whose webhook/verify hasn't landed yet (invoice still "open" for
  // a few seconds) can retry checkout and pay for the same invoice twice, with nothing in the app
  // to catch the second real charge.
  const PENDING_ORDER_REUSE_WINDOW_MS = 15 * 60 * 1000;
  const pendingPayment = await getReusablePendingPayment(invoice.id);
  if (pendingPayment?.providerSessionId && (Date.now() - pendingPayment.createdAt.getTime()) < PENDING_ORDER_REUSE_WINDOW_MS) {
    const existingOrder = await razorpay.orders.fetch(pendingPayment.providerSessionId);
    if (existingOrder.status === "created" || existingOrder.status === "attempted") {
      return Response.json({ orderId: existingOrder.id, amount: existingOrder.amount, currency: existingOrder.currency, key: getRazorpayKeyId() });
    }
  }

  const order = await razorpay.orders.create({
    amount: Math.round(invoice.amount * 100),
    currency: invoice.currency,
    receipt: invoice.number,
    notes: {
      invoiceId: invoice.id,
      bookingId: booking.id,
    },
  });
  await recordPendingPayment({
    invoiceId: invoice.id,
    bookingId: booking.id,
    amount: invoice.amount,
    currency: invoice.currency,
    providerSessionId: order.id,
  });

  return Response.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    key: getRazorpayKeyId(),
  });
}
