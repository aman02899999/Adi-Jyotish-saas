import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, bookings } from "@/db/schema";
import { getCurrentMember } from "@/lib/member-auth";
import { sendBookingNotification } from "@/lib/messaging";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const [member, settings] = await Promise.all([getCurrentMember(), getStudioSettings()]);
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return Response.json({ error: "Invalid booking id." }, { status: 400 });

  const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.clientEmail, member.email))).limit(1);
  if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });
  if (!["pending", "confirmed"].includes(booking.status)) {
    return Response.json({ error: "This consultation can no longer be cancelled." }, { status: 409 });
  }
  if (booking.scheduledAt.getTime() - Date.now() < settings.cancellationHours * 60 * 60 * 1000) {
    return Response.json({ error: `Please contact the studio for changes within ${settings.cancellationHours} hours.` }, { status: 409 });
  }

  const [updated] = await db.update(bookings).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(bookings.id, id), eq(bookings.clientEmail, member.email))).returning();
  await db.insert(auditLogs).values({
    adminId: null,
    adminName: `Member · ${member.name}`.slice(0, 120),
    action: "booking.cancelled_by_member",
    entityType: "booking",
    entityId: updated.reference,
    details: JSON.stringify({ priorStatus: booking.status, paymentStatus: booking.paymentStatus }),
  });
  await sendBookingNotification({
    memberEmail: member.email,
    bookingId: updated.id,
    subject: `${updated.serviceTitle} · ${updated.reference}`,
    body: `Your consultation scheduled for ${updated.scheduledAt.toLocaleString("en", { dateStyle: "long", timeStyle: "short" })} has been cancelled. The studio will review any applicable payment adjustment.`,
  });
  return Response.json(updated);
}
