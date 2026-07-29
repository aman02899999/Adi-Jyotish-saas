import { db } from "@/db";
import { bookings, practitioners, services } from "@/db/schema";
import { seedServices } from "@/lib/services";
import { and, desc, eq, lt, ne, sql } from "drizzle-orm";
import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { getCurrentMember } from "@/lib/member-auth";
import { sendBookingNotification } from "@/lib/messaging";
import { getStudioSettings } from "@/lib/studio-settings";
import { ensureInvoiceForBooking } from "@/lib/billing";
import { validateAvailableSlot } from "@/lib/scheduling";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { createNotification, notifyAdmins } from "@/lib/notifications";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

class SlotUnavailableError extends Error {}

type BookingPayload = {
  serviceId?: number;
  practitionerId?: number;
  bookingDate?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  scheduledAt?: string;
  notes?: string;
};

function clean(value: string | undefined, limit: number) {
  return value?.trim().slice(0, limit) ?? "";
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "bookings")) return Response.json({ error: "Booking permission required." }, { status: 403 });

  const rows = await db.select().from(bookings).orderBy(desc(bookings.scheduledAt));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = (await request.json()) as BookingPayload;
  const [member, settings] = await Promise.all([getCurrentMember(), getStudioSettings()]);

  const throttle = await checkRateLimit("booking-create", member ? `member:${member.id}` : `ip:${requestIp(request)}`, 8, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);
  const serviceId = Number(body.serviceId);
  const practitionerId = Number(body.practitionerId);
  const bookingDate = body.bookingDate?.trim() ?? "";
  const clientName = member?.name ?? clean(body.clientName, 120);
  const clientEmail = member?.email ?? clean(body.clientEmail, 180).toLowerCase();
  const clientPhone = clean(body.clientPhone, 40);
  const birthDate = clean(body.birthDate, 10);
  const birthTime = clean(body.birthTime, 8);
  const birthPlace = clean(body.birthPlace, 180);
  const notes = clean(body.notes, 1500);
  const scheduledAt = new Date(body.scheduledAt ?? "");

  if (!Number.isInteger(serviceId) || serviceId < 1) {
    return Response.json({ error: "Please choose a valid reading." }, { status: 400 });
  }
  if (!Number.isInteger(practitionerId) || practitionerId < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    return Response.json({ error: "Choose an available astrologer and time." }, { status: 400 });
  }
  if (!clientName || !/^\S+@\S+\.\S+$/.test(clientEmail)) {
    return Response.json({ error: "A valid name and email are required." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !/^\d{2}:\d{2}$/.test(birthTime) || !birthPlace) {
    return Response.json({ error: "Complete birth date, time, and place are required." }, { status: 400 });
  }
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + settings.bookingLeadMinutes * 60 * 1000) {
    return Response.json({ error: `Please choose an appointment at least ${settings.bookingLeadMinutes} minutes from now.` }, { status: 400 });
  }

  await seedServices();
  const [[service], [practitioner]] = await Promise.all([
    db.select().from(services).where(eq(services.id, serviceId)).limit(1),
    db.select().from(practitioners).where(eq(practitioners.id, practitionerId)).limit(1),
  ]);
  if (!service || !service.active) return Response.json({ error: "This reading is not currently available." }, { status: 404 });
  if (!practitioner || !practitioner.active) return Response.json({ error: "This astrologer is not currently available." }, { status: 404 });
  const available = await validateAvailableSlot({ date: bookingDate, duration: service.duration, practitionerId, startsAt: scheduledAt });
  if (!available) return Response.json({ error: "This time is no longer available. Choose another open slot." }, { status: 409 });

  const dateCode = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const reference = `JY-${dateCode}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  let created: typeof bookings.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${practitionerId})`);
      const endsAt = new Date(scheduledAt.getTime() + service.duration * 60000);
      const [conflict] = await tx.select({ id: bookings.id }).from(bookings).where(and(
        eq(bookings.practitionerId, practitionerId),
        ne(bookings.status, "cancelled"),
        lt(bookings.scheduledAt, endsAt),
        sql`${bookings.scheduledAt} + (${bookings.serviceDuration} * interval '1 minute') > ${scheduledAt}`,
      )).limit(1);
      if (conflict) throw new SlotUnavailableError();
      const [row] = await tx.insert(bookings).values({
        reference,
        serviceId: service.id,
        serviceTitle: service.title,
        servicePrice: service.price,
        serviceDuration: service.duration,
        practitionerId: practitioner.id,
        practitionerName: practitioner.name,
        clientName,
        clientEmail,
        clientPhone: clientPhone || null,
        birthDate,
        birthTime,
        birthPlace,
        scheduledAt,
        notes: notes || null,
        status: "pending",
        paymentStatus: "unpaid",
      }).returning();
      return row;
    });
  } catch (error) {
    if (error instanceof SlotUnavailableError || (error as { code?: string }).code === "23505") {
      return Response.json({ error: "This time was just reserved by someone else. Choose another slot." }, { status: 409 });
    }
    console.error("Booking transaction failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Booking could not be completed." }, { status: 500 });
  }

  await ensureInvoiceForBooking(created, member?.id);
  getAdminIdsWithPermission("bookings").then((adminIds) => notifyAdmins(adminIds, {
    type: "booking.created",
    title: `New booking · ${created.serviceTitle}`,
    body: `${created.clientName} with ${created.practitionerName} on ${created.scheduledAt.toLocaleDateString("en", { month: "short", day: "numeric" })}.`,
    link: "/admin/bookings",
  })).catch(() => {});
  if (created.practitionerId) {
    createNotification({
      recipientType: "practitioner",
      recipientId: created.practitionerId,
      type: "booking.created",
      title: `New booking · ${created.serviceTitle}`,
      body: `${created.clientName} on ${created.scheduledAt.toLocaleDateString("en", { month: "short", day: "numeric" })}.`,
      link: "/practitioner/bookings",
    }).catch(() => {});
  }
  if (member) {
    await sendBookingNotification({
      memberEmail: member.email,
      bookingId: created.id,
      subject: `${created.serviceTitle} · ${created.reference}`,
      body: `Your consultation with ${created.practitionerName} is reserved for ${created.scheduledAt.toLocaleString("en", { dateStyle: "long", timeStyle: "short" })}. We will keep booking and payment updates together in this conversation.`,
    });
  }
  return Response.json(created, { status: 201 });
}
