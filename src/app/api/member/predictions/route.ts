import { bookingFromDoc } from "@/app/api/bookings/route";
import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { createPrediction, listMemberPredictions, PredictionError } from "@/lib/predictions";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  return Response.json({ predictions: await listMemberPredictions(member.id) });
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("prediction-create", `member:${member.id}`, 20, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as { bookingId?: string; text?: string; expectedByDate?: string };
  const bookingId = body.bookingId?.trim();
  if (!bookingId) return Response.json({ error: "Please choose which consultation this came from." }, { status: 400 });

  const bookingSnap = await db.collection("bookings").doc(bookingId).get();
  if (!bookingSnap.exists) return Response.json({ error: "Only completed practitioner consultations can have predictions logged." }, { status: 403 });
  const booking = bookingFromDoc(bookingSnap);
  if (booking.clientEmail !== member.email || booking.status !== "completed" || !booking.practitionerId) {
    return Response.json({ error: "Only completed practitioner consultations can have predictions logged." }, { status: 403 });
  }

  try {
    const prediction = await createPrediction({
      memberId: member.id,
      memberName: member.name,
      practitionerId: booking.practitionerId,
      practitionerName: booking.practitionerName ?? "Your practitioner",
      bookingId: booking.id,
      serviceTitle: booking.serviceTitle,
      text: body.text ?? "",
      expectedByDate: body.expectedByDate ?? "",
    });
    return Response.json(prediction, { status: 201 });
  } catch (error) {
    if (error instanceof PredictionError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Log prediction failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Could not save this prediction. Please try again." }, { status: 502 });
  }
}
