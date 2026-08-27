import { AI_READING_CURRENCY, AI_READING_PRICE, attachRazorpayOrder, createFreeReading, createPendingReading, FreeReadingAlreadyUsedError, generateReadingAnswer, isEligibleForFreeReading } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { memberBypassesPayment } from "@/lib/payment-bypass";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type CreatePayload = {
  clientName?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  question?: string;
};

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("ai-reading-create", `member:${member.id}`, 5, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as CreatePayload;
  const clientName = body.clientName?.trim() ?? "";
  const birthDate = body.birthDate?.trim() ?? "";
  const birthTime = body.birthTime?.trim() ?? "";
  const birthPlace = body.birthPlace?.trim() ?? "";
  const question = body.question?.trim() ?? "";

  if (!clientName || !birthDate || !birthTime || !birthPlace) {
    return Response.json({ error: "Please share your name and exact birth date, time, and place." }, { status: 400 });
  }
  if (question.length < 8) return Response.json({ error: "Please write a fuller question (at least a sentence)." }, { status: 400 });
  if (question.length > 600) return Response.json({ error: "Please keep your question under 600 characters." }, { status: 400 });

  if (await isEligibleForFreeReading(member.id)) {
    try {
      const freeReading = await createFreeReading({ memberId: member.id, clientName, birthDate, birthTime, birthPlace, question });
      try {
        const answered = await generateReadingAnswer(freeReading);
        return Response.json({ free: true, readingId: freeReading.id, status: answered.status, answer: answered.answer }, { status: 201 });
      } catch {
        return Response.json({ free: true, readingId: freeReading.id, status: "paid", answer: null }, { status: 201 });
      }
    } catch (error) {
      // Lost the race to a concurrent request (double submit, duplicate tab) — fall through to
      // the normal paid flow below instead of erroring out.
      if (!(error instanceof FreeReadingAlreadyUsedError)) throw error;
    }
  }

  const reading = await createPendingReading({ memberId: member.id, clientName, birthDate, birthTime, birthPlace, question });

  // Card payment is optional: with no Razorpay keys the reading is still created and can be paid
  // from the member's wallet, which is the only way this works on a deployment that has not
  // finished setting up online payments yet.
  // A QA bypass account never gets a card order, so it always settles through the
  // pay-from-wallet route — which recognises the bypass and charges nothing.
  const razorpay = memberBypassesPayment(member) ? null : getRazorpay();

  let order = null;
  if (razorpay) {
    order = await razorpay.orders.create({
      amount: AI_READING_PRICE * 100,
      currency: AI_READING_CURRENCY,
      receipt: `ai-reading-${reading.id}-${Date.now()}`,
      notes: { memberId: String(member.id), readingId: String(reading.id) },
    });
    await attachRazorpayOrder(reading.id, order.id);
  }

  return Response.json({ readingId: reading.id, price: reading.price, currency: reading.currency, orderId: order?.id ?? null, amount: order?.amount ?? null, key: order ? getRazorpayKeyId() : null });
}
