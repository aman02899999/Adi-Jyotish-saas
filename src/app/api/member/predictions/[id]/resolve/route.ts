import { getCurrentMember } from "@/lib/member-auth";
import { PredictionError, resolvePrediction, type PredictionStatus } from "@/lib/predictions";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const RESOLVABLE_STATUSES = new Set<PredictionStatus>(["came_true", "did_not_happen", "unclear"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("prediction-resolve", `member:${member.id}`, 30, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const { id } = await params;
  const body = (await request.json()) as { status?: string };
  if (!RESOLVABLE_STATUSES.has(body.status as PredictionStatus)) {
    return Response.json({ error: "Please choose a valid outcome." }, { status: 400 });
  }

  try {
    const prediction = await resolvePrediction({ memberId: member.id, predictionId: id, status: body.status as Exclude<PredictionStatus, "pending"> });
    return Response.json(prediction);
  } catch (error) {
    if (error instanceof PredictionError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Resolve prediction failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Could not update this prediction. Please try again." }, { status: 502 });
  }
}
