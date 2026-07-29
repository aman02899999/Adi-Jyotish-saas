import { getCurrentMember } from "@/lib/member-auth";
import { verifySubscriptionCheckout } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

type VerifyPayload = {
  razorpay_subscription_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json()) as VerifyPayload;
  const subscriptionId = body.razorpay_subscription_id?.trim();
  const paymentId = body.razorpay_payment_id?.trim();
  const signature = body.razorpay_signature?.trim();
  if (!subscriptionId || !paymentId || !signature) return Response.json({ error: "Payment confirmation was incomplete." }, { status: 400 });

  try {
    await verifySubscriptionCheckout(member, subscriptionId, paymentId, signature);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Subscription could not be confirmed." }, { status: 400 });
  }
}
