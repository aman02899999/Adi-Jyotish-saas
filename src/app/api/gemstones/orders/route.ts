import { attachRazorpayOrder, CartValidationError, createPendingOrder } from "@/lib/gemstone-orders";
import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

type CheckoutPayload = {
  lines?: Array<{ variantId: number; quantity: number }>;
  couponCode?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  shipping?: { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string; country?: string };
};

export async function POST(request: Request) {
  const member = await getCurrentMember();
  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

  const body = (await request.json()) as CheckoutPayload;
  const lines = (body.lines ?? []).filter((line) => line.variantId && line.quantity > 0);
  if (!lines.length) return Response.json({ error: "Your cart is empty." }, { status: 400 });
  if (!body.shipping?.name || !body.shipping?.phone || !body.shipping?.line1 || !body.shipping?.city || !body.shipping?.state || !body.shipping?.pincode) {
    return Response.json({ error: "Please complete your shipping address." }, { status: 400 });
  }
  if (!member && !body.guestEmail?.trim()) return Response.json({ error: "Enter an email address for your order confirmation." }, { status: 400 });

  try {
    const order = await createPendingOrder({
      memberId: member?.id ?? null,
      guestName: body.guestName,
      guestEmail: body.guestEmail,
      guestPhone: body.guestPhone,
      shipping: body.shipping,
      lines,
      couponCode: body.couponCode,
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: order.total * 100,
      currency: order.currency,
      receipt: order.orderNumber,
      notes: { gemstoneOrderId: String(order.id), memberId: member ? String(member.id) : "guest" },
    });
    await attachRazorpayOrder(order.id, razorpayOrder.id);

    return Response.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
      total: order.total,
    });
  } catch (error) {
    return Response.json({ error: error instanceof CartValidationError ? error.message : "Your order could not be started." }, { status: 400 });
  }
}
