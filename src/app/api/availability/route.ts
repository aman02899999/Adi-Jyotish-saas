import { db } from "@/lib/firestore";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { getAvailableSlots } from "@/lib/scheduling";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { getServiceByIdInSupabase } from "@/lib/services-supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Unauthenticated, force-dynamic, and every call runs an uncached bookings-window query on top
  // of the service lookup — the one public route here that had no ceiling on how often a stranger
  // could trigger that. The limit is generous enough for the booking form, which re-queries on
  // each date or practitioner change: a visitor comparing a month of dates stays well inside it.
  const throttle = await checkRateLimit("availability", requestIp(request), 60, 300);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const practitionerId = url.searchParams.get("practitionerId") || undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !serviceId) return Response.json({ error: "Date and service are required." }, { status: 400 });
  let service: { duration: number; active: boolean } | null;
  if (isSupabaseCutoverActive()) {
    const row = await getServiceByIdInSupabase(serviceId);
    service = row ? { duration: row.duration, active: row.active } : null;
  } else {
    const snap = await db.collection("services").doc(serviceId).get();
    service = snap.exists ? (snap.data() as { duration: number; active: boolean }) : null;
  }
  if (!service || !service.active) return Response.json({ error: "Service not available." }, { status: 404 });
  return Response.json(await getAvailableSlots({ date, duration: service.duration, practitionerId }));
}
