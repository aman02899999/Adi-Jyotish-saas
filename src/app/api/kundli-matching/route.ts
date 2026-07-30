import { createKundliMatch, KundliMatchError } from "@/lib/kundli-matching";
import { getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Payload = { nameA?: string; birthDateA?: string; nameB?: string; birthDateB?: string };

export async function POST(request: Request) {
  const member = await getCurrentMember();

  const throttle = await checkRateLimit("kundli-matching", `ip:${requestIp(request)}`, 5, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as Payload;
  const nameA = body.nameA?.trim().slice(0, 120) ?? "";
  const birthDateA = body.birthDateA?.trim() ?? "";
  const nameB = body.nameB?.trim().slice(0, 120) ?? "";
  const birthDateB = body.birthDateB?.trim() ?? "";

  if (!nameA || !nameB) return Response.json({ error: "Please share both names." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateA) || !/^\d{4}-\d{2}-\d{2}$/.test(birthDateB)) {
    return Response.json({ error: "Please choose valid birth dates for both people." }, { status: 400 });
  }

  try {
    const match = await createKundliMatch({ memberId: member?.id ?? null, nameA, birthDateA, nameB, birthDateB });
    return Response.json({ score: match.compatibilityScore, narrative: match.narrative }, { status: 201 });
  } catch (error) {
    if (error instanceof KundliMatchError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Kundli matching failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Your compatibility reading could not be prepared. Please try again shortly." }, { status: 502 });
  }
}
