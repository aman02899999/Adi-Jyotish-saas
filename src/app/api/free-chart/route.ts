import { KundliEngineError } from "@/lib/kundli-engine";
import { buildFreeChartPreview } from "@/lib/free-chart";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { asText, readJsonBody } from "@/lib/request-body";

export const dynamic = "force-dynamic";

/** Public and unauthenticated: the homepage's free chart preview. Nothing is stored and no AI is
 * called, so the only thing to protect is CPU, which the per-IP limit covers. */
export async function POST(request: Request) {
  const throttle = await checkRateLimit("free-chart", `ip:${requestIp(request)}`, 20, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const birthDate = asText(body.birthDate)?.trim() ?? "";
  const birthTime = asText(body.birthTime)?.trim() ?? "";
  const birthPlace = asText(body.birthPlace)?.trim().slice(0, 160) ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`))) {
    return Response.json({ error: "Please choose your date of birth." }, { status: 400 });
  }
  const year = Number(birthDate.slice(0, 4));
  if (year < 1900 || new Date(`${birthDate}T00:00:00Z`) > new Date()) {
    return Response.json({ error: "Please choose a birth date between 1900 and today." }, { status: 400 });
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(birthTime)) return Response.json({ error: "Please choose your time of birth." }, { status: 400 });
  if (birthPlace.length < 2) return Response.json({ error: "Please enter the city you were born in." }, { status: 400 });

  try {
    return Response.json(buildFreeChartPreview({ birthDate, birthTime, birthPlace }));
  } catch (error) {
    if (error instanceof KundliEngineError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Free chart preview failed", error);
    return Response.json({ error: "Your chart could not be calculated. Please try again." }, { status: 500 });
  }
}
