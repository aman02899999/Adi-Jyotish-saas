import { AI_READING_CURRENCY, AI_VARSHPHAL_PRICE, attachRazorpayOrder, createPendingVarshphalReading } from "@/lib/ai-readings";
import { AmbiguousPlaceError, resolvePlaceToCoordinates } from "@/lib/geo";
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
  year?: number;
};

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("varshphal-report-create", `member:${member.id}`, 5, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as CreatePayload;
  const clientName = body.clientName?.trim() ?? "";
  const birthDate = body.birthDate?.trim() ?? "";
  const birthTime = body.birthTime?.trim() ?? "";
  const birthPlace = body.birthPlace?.trim() ?? "";
  const year = Math.round(Number(body.year));

  if (!clientName || !birthDate || !birthTime || !birthPlace) {
    return Response.json({ error: "Please share your name and exact birth date, time, and place." }, { status: 400 });
  }
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < currentYear || year > currentYear + 1) {
    return Response.json({ error: "Please choose this year or next year for your Varshphal." }, { status: 400 });
  }
  try {
    if (!resolvePlaceToCoordinates(birthPlace)) {
      return Response.json({ error: `We couldn't recognize "${birthPlace}" — please try a nearby major city, or add the state/country too.` }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof AmbiguousPlaceError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }

  const reading = await createPendingVarshphalReading({ memberId: member.id, clientName, birthDate, birthTime, birthPlace, year });

  // Card payment is optional: with no Razorpay keys the reading is still created and can be paid
  // from the member's wallet, which is the only way this works on a deployment that has not
  // finished setting up online payments yet.
  // A QA bypass account never gets a card order, so it always settles through the
  // pay-from-wallet route — which recognises the bypass and charges nothing.
  const razorpay = memberBypassesPayment(member) ? null : getRazorpay();

  let order = null;
  if (razorpay) {
    order = await razorpay.orders.create({
      amount: AI_VARSHPHAL_PRICE * 100,
      currency: AI_READING_CURRENCY,
      receipt: `varshphal-${reading.id}-${Date.now()}`,
      notes: { memberId: String(member.id), readingId: String(reading.id) },
    });
    await attachRazorpayOrder(reading.id, order.id);
  }

  return Response.json({ readingId: reading.id, price: reading.price, currency: reading.currency, orderId: order?.id ?? null, amount: order?.amount ?? null, key: order ? getRazorpayKeyId() : null });
}
