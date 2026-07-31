import { orderConfirmationEmailHtml, sendEmail } from "@/lib/email";
import { getOrderById, getOrderItems, markOrderPaid, OrderNotFoundError } from "@/lib/gemstone-orders";
import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay, verifyRazorpayPaymentSignature } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

type VerifyPayload = { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return Response.json({ error: "Invalid order id." }, { status: 400 });

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

  const order = await getOrderById(id);
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

  const member = await getCurrentMember();
  if (order.memberId && (!member || member.id !== order.memberId)) return Response.json({ error: "This order does not belong to your account." }, { status: 403 });

  const body = (await request.json()) as VerifyPayload;
  const razorpayOrderId = body.razorpay_order_id?.trim();
  const paymentId = body.razorpay_payment_id?.trim();
  const signature = body.razorpay_signature?.trim();
  if (!razorpayOrderId || !paymentId || !signature) return Response.json({ error: "Payment confirmation was incomplete." }, { status: 400 });
  if (razorpayOrderId !== order.razorpayOrderId) return Response.json({ error: "This payment does not match this order." }, { status: 400 });
  if (!verifyRazorpayPaymentSignature(razorpayOrderId, paymentId, signature)) return Response.json({ error: "Payment signature could not be verified." }, { status: 400 });

  const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
  if (razorpayOrder.status !== "paid") return Response.json({ error: "Payment has not been confirmed by Razorpay yet." }, { status: 409 });

  try {
    const paid = await markOrderPaid({ orderId: id, razorpayPaymentId: paymentId });

    const items = await getOrderItems(id);
    const recipientEmail = order.guestEmail || member?.email;
    if (recipientEmail) {
      sendEmail({
        to: recipientEmail,
        subject: `Order confirmed — ${order.orderNumber}`,
        html: orderConfirmationEmailHtml({
          orderNumber: order.orderNumber,
          customerName: order.shippingName,
          items: items.map((item) => ({ productName: item.productName, variantLabel: item.variantLabel, quantity: item.quantity, lineTotal: item.lineTotal })),
          subtotal: order.subtotal,
          discount: order.discount,
          shippingFee: order.shippingFee,
          total: order.total,
          currency: order.currency,
        }),
      }).catch(() => {});
    }

    return Response.json({ ok: true, orderNumber: paid.orderNumber, status: paid.status });
  } catch (error) {
    if (error instanceof OrderNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    return Response.json({ error: "Payment could not be confirmed. Contact support if you were charged." }, { status: 500 });
  }
}
