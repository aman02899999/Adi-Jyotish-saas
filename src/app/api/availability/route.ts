import { db } from "@/lib/firestore";
import { getAvailableSlots } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const practitionerId = url.searchParams.get("practitionerId") || undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !serviceId) return Response.json({ error: "Date and service are required." }, { status: 400 });
  const snap = await db.collection("services").doc(serviceId).get();
  const service = snap.exists ? (snap.data() as { duration: number; active: boolean }) : null;
  if (!service || !service.active) return Response.json({ error: "Service not available." }, { status: 404 });
  return Response.json(await getAvailableSlots({ date, duration: service.duration, practitionerId }));
}
