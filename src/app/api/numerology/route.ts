import { createNumerologyReading, NumerologyError } from "@/lib/numerology";
import { getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Payload = { name?: string; birthDate?: string };

export async function POST(request: Request) {
  const member = await getCurrentMember();

  const throttle = await checkRateLimit("numerology-create", `ip:${requestIp(request)}`, 5, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as Payload;
  const name = body.name?.trim().slice(0, 120) ?? "";
  const birthDate = body.birthDate?.trim() ?? "";

  if (!name) return Response.json({ error: "Please share your name." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return Response.json({ error: "Please choose a valid birth date." }, { status: 400 });

  try {
    const reading = await createNumerologyReading({ memberId: member?.id ?? null, name, birthDate });
    return Response.json({ lifePathNumber: reading.lifePathNumber, destinyNumber: reading.destinyNumber, narrative: reading.narrative }, { status: 201 });
  } catch (error) {
    if (error instanceof NumerologyError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Numerology reading failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Your numerology reading could not be prepared. Please try again shortly." }, { status: 502 });
  }
}
