import { searchPlaces } from "@/lib/geo";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = requestIp(request);
  const throttle = await checkRateLimit("geo-places", `ip:${ip}`, 60, 60);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const query = new URL(request.url).searchParams.get("q")?.slice(0, 80) ?? "";
  return Response.json({ places: searchPlaces(query) });
}
