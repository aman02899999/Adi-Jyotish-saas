import { getDailyHoroscope, isZodiacSign } from "@/lib/horoscopes";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ sign: string }> }) {
  const { sign } = await params;
  if (!isZodiacSign(sign)) return Response.json({ error: "Unknown zodiac sign." }, { status: 404 });

  const throttle = await checkRateLimit("horoscope-read", requestIp(request), 60, 60);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  try {
    const horoscope = await getDailyHoroscope(sign);
    return Response.json({ sign, date: horoscope.date, content: horoscope.content });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Horoscope could not be generated." }, { status: 502 });
  }
}
