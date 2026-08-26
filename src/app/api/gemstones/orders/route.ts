import { attachRazorpayOrder, CartValidationError, createPendingOrder, GEMSTONE_STORE_OPEN } from "@/lib/gemstone-orders";
import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type CheckoutPayload = {
  lines?: Array<{ productId: string; variantId: string; quantity: number }>;
  couponCode?: string;
  shipping?: { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string; country?: string };
};

export async function POST(request: Request) {
  if (!GEMSTONE_STORE_OPEN) return Response.json({ error: "The gemstone store isn't open yet." }, { status: 503 });

  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Sign in to complete your purchase." }, { status: 401 });

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

  // Tighter than most sibling limits on purpose: each successful call reserves stock (and coupon
  // usage) for the pending-order TTL before any payment happens, so this caps how many
  // simultaneous reservations one identity can hold against scarce inventory, not just how often
  // they can hit the endpoint.
  const throttle = await checkRateLimit("gemstone-order", `member:${member.id}`, 5, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as CheckoutPayload;
  // Per-line quantity is capped in priceCart, but the number of distinct lines wasn't — an
  // unbounded lines array would still fan out one Firestore read per line inside a per-member
  // 5/10min-throttled request, a cheap resource-exhaustion amplifier. No real cart needs more than
  // this many distinct product/variant combinations.
  const lines = (body.lines ?? []).slice(0, 50).filter((line) => line.productId && line.variantId && line.quantity > 0);
  if (!lines.length) return Response.json({ error: "Your cart is empty." }, { status: 400 });
  if (!body.shipping?.name || !body.shipping?.phone || !body.shipping?.line1 || !body.shipping?.city || !body.shipping?.state || !body.shipping?.pincode) {
    return Response.json({ error: "Please complete your shipping address." }, { status: 400 });
  }

  try {
    const order = await createPendingOrder({
      memberId: member.id,
      shipping: body.shipping,
      lines,
      couponCode: body.couponCode,
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: order.total * 100,
      currency: order.currency,
      receipt: order.orderNumber,
      notes: { gemstoneOrderId: String(order.id), memberId: String(member.id) },
    });
    await attachRazorpayOrder(order.id, razorpayOrder.id);

    return Response.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: getRazorpayKeyId(),
      total: order.total,
    });
  } catch (error) {
    return Response.json({ error: error instanceof CartValidationError ? error.message : "Your order could not be started." }, { status: 400 });
  }
}
