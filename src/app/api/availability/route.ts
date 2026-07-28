import { db } from "@/db";
import { services } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAvailableSlots } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  const serviceId = Number(url.searchParams.get("serviceId"));
  const practitionerId = Number(url.searchParams.get("practitionerId")) || undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(serviceId)) return Response.json({ error: "Date and service are required." }, { status: 400 });
  const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!service || !service.active) return Response.json({ error: "Service not available." }, { status: 404 });
  return Response.json(await getAvailableSlots({ date, duration: service.duration, practitionerId }));
}
