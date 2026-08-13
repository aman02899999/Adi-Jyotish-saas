import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { GIFT_AMOUNTS } from "@/lib/gift-cards";
import { getOrCreateWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in." }, { status: 401 });

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

  const throttle = await checkRateLimit("gift-checkout", `member:${member.id}`, 10, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as { amount?: number; recipientName?: string; message?: string };
  const amount = Number(body.amount);
  if (!GIFT_AMOUNTS.includes(amount as (typeof GIFT_AMOUNTS)[number])) {
    return Response.json({ error: "Please choose one of the available gift amounts." }, { status: 400 });
  }
  const recipientName = (body.recipientName ?? "").trim().slice(0, 120);
  const message = (body.message ?? "").trim().slice(0, 280);

  const wallet = await getOrCreateWallet(member.id);
  const order = await razorpay.orders.create({
    amount: amount * 100,
    currency: wallet.currency,
    receipt: `gift-${member.id}-${Date.now()}`,
    notes: { memberId: String(member.id), purpose: "gift_card", recipientName, message },
  });

  return Response.json({ orderId: order.id, amount: order.amount, currency: order.currency, key: getRazorpayKeyId() });
}
