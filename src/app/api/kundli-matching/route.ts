import { createKundliMatch, KundliMatchError } from "@/lib/kundli-matching";
import { getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

type Payload = {
  nameA?: string; birthDateA?: string; birthTimeA?: string; birthPlaceA?: string;
  nameB?: string; birthDateB?: string; birthTimeB?: string; birthPlaceB?: string;
  turnstileToken?: string;
};

export async function POST(request: Request) {
  const member = await getCurrentMember();
  const ip = requestIp(request);

  const throttle = await checkRateLimit("kundli-matching", `ip:${ip}`, 5, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as Payload;
  if (!(await verifyTurnstileToken(body.turnstileToken, ip))) {
    return Response.json({ error: "Verification failed. Please try again." }, { status: 403 });
  }
  const nameA = body.nameA?.trim().slice(0, 120) ?? "";
  const birthDateA = body.birthDateA?.trim() ?? "";
  const birthTimeA = body.birthTimeA?.trim() ?? "";
  const birthPlaceA = body.birthPlaceA?.trim().slice(0, 160) ?? "";
  const nameB = body.nameB?.trim().slice(0, 120) ?? "";
  const birthDateB = body.birthDateB?.trim() ?? "";
  const birthTimeB = body.birthTimeB?.trim() ?? "";
  const birthPlaceB = body.birthPlaceB?.trim().slice(0, 160) ?? "";

  if (!nameA || !nameB) return Response.json({ error: "Please share both names." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateA) || !/^\d{4}-\d{2}-\d{2}$/.test(birthDateB)) {
    return Response.json({ error: "Please choose valid birth dates for both people." }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(birthTimeA) || !/^\d{2}:\d{2}$/.test(birthTimeB)) {
    return Response.json({ error: "Please enter valid birth times for both people — Guna Milan needs the Moon's exact position." }, { status: 400 });
  }
  if (!birthPlaceA || !birthPlaceB) return Response.json({ error: "Please share both birth places." }, { status: 400 });

  try {
    const { match, result, moonARashi, moonANakshatra, moonBRashi, moonBNakshatra, timeline } = await createKundliMatch({
      memberId: member?.id ?? null, nameA, birthDateA, birthTimeA, birthPlaceA, nameB, birthDateB, birthTimeB, birthPlaceB,
    });
    return Response.json({
      id: match.id,
      score: match.compatibilityScore,
      maxScore: result.maxScore,
      breakdown: result.breakdown,
      nadiDosha: result.nadiDosha,
      bhakootDosha: result.bhakootDosha,
      moonARashi, moonANakshatra, moonBRashi, moonBNakshatra,
      narrative: match.narrative,
      timeline,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof KundliMatchError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Kundli matching failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Your compatibility reading could not be prepared. Please try again shortly." }, { status: 502 });
  }
}
