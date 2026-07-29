import { AI_READING_CURRENCY, AI_READING_PRICE, attachRazorpayOrder, createPendingReading } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay } from "@/lib/razorpay";

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

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

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

  const reading = await createPendingReading({ memberId: member.id, clientName, birthDate, birthTime, birthPlace, question });

  const order = await razorpay.orders.create({
    amount: AI_READING_PRICE * 100,
    currency: AI_READING_CURRENCY,
    receipt: `ai-reading-${reading.id}-${Date.now()}`,
    notes: { memberId: String(member.id), readingId: String(reading.id) },
  });
  await attachRazorpayOrder(reading.id, order.id);

  return Response.json({ readingId: reading.id, orderId: order.id, amount: order.amount, currency: order.currency, key: process.env.RAZORPAY_KEY_ID });
}
