import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay } from "@/lib/razorpay";
import { getOrCreateWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";
const MIN_RECHARGE = 50;
const MAX_RECHARGE = 50000;

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

  const body = (await request.json()) as { amount?: number };
  const amount = Math.round(Number(body.amount));
  if (!Number.isInteger(amount) || amount < MIN_RECHARGE || amount > MAX_RECHARGE) {
    return Response.json({ error: `Choose an amount between ${MIN_RECHARGE} and ${MAX_RECHARGE}.` }, { status: 400 });
  }

  const wallet = await getOrCreateWallet(member.id);
  const order = await razorpay.orders.create({
    amount: amount * 100,
    currency: wallet.currency,
    receipt: `wallet-${member.id}-${Date.now()}`,
    notes: { memberId: String(member.id) },
  });

  return Response.json({ orderId: order.id, amount: order.amount, currency: order.currency, key: process.env.RAZORPAY_KEY_ID });
}
