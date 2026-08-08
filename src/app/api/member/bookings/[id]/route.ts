import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { sendBookingNotification } from "@/lib/messaging";
import { getStudioSettings } from "@/lib/studio-settings";
import { bookingFromDoc } from "@/app/api/bookings/route";

export const dynamic = "force-dynamic";

export async function PUT(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const [member, settings] = await Promise.all([getCurrentMember(), getStudioSettings()]);
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const { id } = await params;

  const ref = db.collection("bookings").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Booking not found." }, { status: 404 });
  const booking = bookingFromDoc(snap);
  if (booking.clientEmail !== member.email) return Response.json({ error: "Booking not found." }, { status: 404 });
  if (!["pending", "confirmed"].includes(booking.status)) {
    return Response.json({ error: "This consultation can no longer be cancelled." }, { status: 409 });
  }
  if (booking.scheduledAt.getTime() - Date.now() < settings.cancellationHours * 60 * 60 * 1000) {
    return Response.json({ error: `Please contact the studio for changes within ${settings.cancellationHours} hours.` }, { status: 409 });
  }

  await ref.update({ status: "cancelled", updatedAt: FieldValue.serverTimestamp() });
  const updated = { ...booking, status: "cancelled", updatedAt: new Date() };
  await db.collection("auditLogs").add({
    adminId: null,
    adminName: `Member · ${member.name}`.slice(0, 120),
    action: "booking.cancelled_by_member",
    entityType: "booking",
    entityId: updated.reference,
    details: JSON.stringify({ priorStatus: booking.status, paymentStatus: booking.paymentStatus }),
    createdAt: FieldValue.serverTimestamp(),
  });
  await sendBookingNotification({
    memberEmail: member.email,
    bookingId: updated.id,
    subject: `${updated.serviceTitle} · ${updated.reference}`,
    body: `Your consultation scheduled for ${updated.scheduledAt.toLocaleString("en", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" })} has been cancelled. The studio will review any applicable payment adjustment.`,
  });
  return Response.json(updated);
}
