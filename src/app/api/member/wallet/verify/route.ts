import { getCurrentMember } from "@/lib/member-auth";
import { processReferralReward } from "@/lib/referrals";
import { getRazorpay, verifyRazorpayPaymentSignature } from "@/lib/razorpay";
import { rechargeWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";

type VerifyPayload = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

  const body = (await request.json()) as VerifyPayload;
  const orderId = body.razorpay_order_id?.trim();
  const paymentId = body.razorpay_payment_id?.trim();
  const signature = body.razorpay_signature?.trim();
  if (!orderId || !paymentId || !signature) return Response.json({ error: "Payment confirmation was incomplete." }, { status: 400 });
  if (!verifyRazorpayPaymentSignature(orderId, paymentId, signature)) return Response.json({ error: "Payment signature could not be verified." }, { status: 400 });

  const order = await razorpay.orders.fetch(orderId);
  if (order.notes?.memberId !== String(member.id)) return Response.json({ error: "This payment does not belong to your account." }, { status: 403 });
  if (order.status !== "paid") return Response.json({ error: "Payment has not been confirmed by Razorpay yet." }, { status: 409 });

  const amount = Math.round(Number(order.amount) / 100);
  const wallet = await rechargeWallet({ memberId: member.id, amount, razorpayPaymentId: paymentId });
  await processReferralReward(member.id).catch((error) => console.error("Referral reward processing failed", error));
  return Response.json({ ok: true, balance: wallet.balance, currency: wallet.currency });
}
