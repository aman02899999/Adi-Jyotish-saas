import { createGemstoneRecommendation, RecommendationError } from "@/lib/gemstone-recommendations";
import { getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

type Payload = { name?: string; birthDate?: string; concern?: string; turnstileToken?: string };

export async function POST(request: Request) {
  const member = await getCurrentMember();
  const ip = requestIp(request);

  const throttle = await checkRateLimit("gemstone-recommendation", `ip:${ip}`, 5, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as Payload;
  if (!(await verifyTurnstileToken(body.turnstileToken, ip))) {
    return Response.json({ error: "Verification failed. Please try again." }, { status: 403 });
  }
  const name = body.name?.trim().slice(0, 120) ?? "";
  const birthDate = body.birthDate?.trim() ?? "";
  const concern = body.concern?.trim().slice(0, 300) ?? "";

  if (!name) return Response.json({ error: "Please share your name." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return Response.json({ error: "Please choose a valid birth date." }, { status: 400 });

  try {
    const { recommendation, sign, products } = await createGemstoneRecommendation({ memberId: member?.id ?? null, name, birthDate, concern });
    return Response.json({
      narrative: recommendation.narrative,
      sign: { name: sign.name, symbol: sign.symbol },
      products,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof RecommendationError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Gemstone recommendation failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Your recommendation could not be prepared. Please try again shortly." }, { status: 502 });
  }
}
