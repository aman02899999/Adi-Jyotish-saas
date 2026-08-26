import { AI_READING_CURRENCY, AI_TAROT_READING_PRICE, attachRazorpayOrder, createPendingTarotReading } from "@/lib/ai-readings";
import { drawTarotSpread } from "@/lib/tarot-deck";
import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type CreatePayload = {
  clientName?: string;
  question?: string;
};

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("ai-tarot-reading-create", `member:${member.id}`, 5, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as CreatePayload;
  const clientName = body.clientName?.trim().slice(0, 120) ?? "";
  const question = body.question?.trim().slice(0, 600) ?? "";

  if (!clientName) return Response.json({ error: "Please share your name." }, { status: 400 });
  if (question.length < 8) return Response.json({ error: "Please write a fuller question (at least a sentence)." }, { status: 400 });

  const cards = drawTarotSpread();
  const reading = await createPendingTarotReading({ memberId: member.id, clientName, question, cards });

  // Card payment is optional: with no Razorpay keys the reading is still created and can be paid
  // from the member's wallet, which is the only way this works on a deployment that has not
  // finished setting up online payments yet.
  const razorpay = getRazorpay();

  let order = null;
  if (razorpay) {
    order = await razorpay.orders.create({
      amount: AI_TAROT_READING_PRICE * 100,
      currency: AI_READING_CURRENCY,
      receipt: `tarot-reading-${reading.id}-${Date.now()}`,
      notes: { memberId: String(member.id), readingId: String(reading.id) },
    });
    await attachRazorpayOrder(reading.id, order.id);
  }

  return Response.json({ readingId: reading.id, price: reading.price, currency: reading.currency, orderId: order?.id ?? null, amount: order?.amount ?? null, key: order ? getRazorpayKeyId() : null, cards });
}
