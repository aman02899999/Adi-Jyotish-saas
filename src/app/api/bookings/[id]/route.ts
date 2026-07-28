import { db } from "@/db";
import { bookings } from "@/db/schema";
import { and, eq, lt, ne, sql } from "drizzle-orm";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { sendBookingNotification } from "@/lib/messaging";
import { dateInTimeZone, validateAvailableSlot } from "@/lib/scheduling";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

class ScheduleConflictError extends Error {}

const statuses = ["pending", "confirmed", "completed", "cancelled"] as const;

type BookingUpdate = {
  status?: string;
  paymentStatus?: string;
  scheduledAt?: string;
  notes?: string;
};

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "bookings")) return Response.json({ error: "Booking permission required." }, { status: 403 });

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return Response.json({ error: "Invalid booking id." }, { status: 400 });

  const body = (await request.json()) as BookingUpdate;
  if (body.status && !statuses.includes(body.status as (typeof statuses)[number])) {
    return Response.json({ error: "Invalid booking status." }, { status: 400 });
  }
  if (body.paymentStatus) {
    return Response.json({ error: "Manage payment changes through the invoice ledger." }, { status: 409 });
  }

  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : undefined;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return Response.json({ error: "Invalid appointment date." }, { status: 400 });
  const [existing] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Booking not found." }, { status: 404 });
  if (scheduledAt && existing.practitionerId) {
    const settings = await getStudioSettings();
    const available = await validateAvailableSlot({ date: dateInTimeZone(scheduledAt, settings.timezone), duration: existing.serviceDuration, practitionerId: existing.practitionerId, startsAt: scheduledAt, excludeBookingId: existing.id });
    if (!available) return Response.json({ error: "That practitioner is unavailable at the new time." }, { status: 409 });
  }

  let updated: typeof bookings.$inferSelect;
  try {
    updated = await db.transaction(async (tx) => {
      if (scheduledAt && existing.practitionerId) {
        await tx.execute(sql`select pg_advisory_xact_lock(${existing.practitionerId})`);
        const endsAt = new Date(scheduledAt.getTime() + existing.serviceDuration * 60000);
        const [conflict] = await tx.select({ id: bookings.id }).from(bookings).where(and(
          eq(bookings.practitionerId, existing.practitionerId),
          ne(bookings.id, existing.id),
          ne(bookings.status, "cancelled"),
          lt(bookings.scheduledAt, endsAt),
          sql`${bookings.scheduledAt} + (${bookings.serviceDuration} * interval '1 minute') > ${scheduledAt}`,
        )).limit(1);
        if (conflict) throw new ScheduleConflictError();
      }
      const [row] = await tx.update(bookings).set({
        ...(body.status ? { status: body.status } : {}),
        ...(scheduledAt ? { scheduledAt } : {}),
        ...(typeof body.notes === "string" ? { notes: body.notes.trim().slice(0, 1500) || null } : {}),
        updatedAt: new Date(),
      }).where(eq(bookings.id, id)).returning();
      if (!row) throw new Error("Booking not found");
      return row;
    });
  } catch (error) {
    if (error instanceof ScheduleConflictError || (error as { code?: string }).code === "23505") {
      return Response.json({ error: "That practitioner is unavailable at the new time." }, { status: 409 });
    }
    console.error("Booking update transaction failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Booking could not be updated." }, { status: 500 });
  }
  await recordAudit(admin, "booking.updated", "booking", updated.reference, {
    status: updated.status,
    paymentStatus: updated.paymentStatus,
    rescheduled: Boolean(body.scheduledAt),
  });
  if (body.status || body.paymentStatus || body.scheduledAt) {
    const changes = [
      body.status ? `Booking status: ${updated.status}.` : "",
      body.paymentStatus ? `Payment status: ${updated.paymentStatus}.` : "",
      body.scheduledAt ? `New appointment: ${updated.scheduledAt.toLocaleString("en", { dateStyle: "long", timeStyle: "short" })}.` : "",
    ].filter(Boolean).join(" ");
    await sendBookingNotification({ memberEmail: updated.clientEmail, bookingId: updated.id, subject: `${updated.serviceTitle} · ${updated.reference}`, body: `Your consultation was updated. ${changes}` });
  }
  return Response.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "bookings")) return Response.json({ error: "Booking permission required." }, { status: 403 });

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return Response.json({ error: "Invalid booking id." }, { status: 400 });

  const [deleted] = await db.delete(bookings).where(eq(bookings.id, id)).returning({ id: bookings.id, reference: bookings.reference });
  if (!deleted) return Response.json({ error: "Booking not found." }, { status: 404 });
  await recordAudit(admin, "booking.deleted", "booking", deleted.reference);
  return Response.json({ ok: true, id: deleted.id });
}
