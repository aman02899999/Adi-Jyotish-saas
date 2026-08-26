import { AI_KUNDLI_PRICE, AI_READING_CURRENCY, attachRazorpayOrder, createPendingKundliReport } from "@/lib/ai-readings";
import { AmbiguousPlaceError, resolvePlaceToCoordinates } from "@/lib/geo";
import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type CreatePayload = {
  clientName?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
};

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

  const throttle = await checkRateLimit("kundli-report-create", `member:${member.id}`, 5, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as CreatePayload;
  const clientName = body.clientName?.trim() ?? "";
  const birthDate = body.birthDate?.trim() ?? "";
  const birthTime = body.birthTime?.trim() ?? "";
  const birthPlace = body.birthPlace?.trim() ?? "";

  if (!clientName || !birthDate || !birthTime || !birthPlace) {
    return Response.json({ error: "Please share your name and exact birth date, time, and place." }, { status: 400 });
  }
  try {
    if (!resolvePlaceToCoordinates(birthPlace)) {
      return Response.json({ error: `We couldn't recognize "${birthPlace}" — please try a nearby major city, or add the state/country too.` }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof AmbiguousPlaceError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }

  const reading = await createPendingKundliReport({ memberId: member.id, clientName, birthDate, birthTime, birthPlace });

  const order = await razorpay.orders.create({
    amount: AI_KUNDLI_PRICE * 100,
    currency: AI_READING_CURRENCY,
    receipt: `kundli-report-${reading.id}-${Date.now()}`,
    notes: { memberId: String(member.id), readingId: String(reading.id) },
  });
  await attachRazorpayOrder(reading.id, order.id);

  return Response.json({ readingId: reading.id, orderId: order.id, amount: order.amount, currency: order.currency, key: getRazorpayKeyId() });
}
