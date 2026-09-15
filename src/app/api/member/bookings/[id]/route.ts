import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { sendBookingNotification } from "@/lib/messaging";
import { getStudioSettings } from "@/lib/studio-settings";
import { bookingFromDoc } from "@/app/api/bookings/route";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { getBookingByIdInSupabase, updateBookingInSupabase } from "@/lib/bookings-supabase";
import { recordAudit } from "@/lib/admin-auth";
import type { BookingRecord } from "@/lib/booking-creation";

export const dynamic = "force-dynamic";

export async function PUT(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const [member, settings] = await Promise.all([getCurrentMember(), getStudioSettings()]);
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const { id } = await params;

  const cutover = isSupabaseCutoverActive();
  let booking: BookingRecord | null;
  if (cutover) {
    booking = await getBookingByIdInSupabase(id);
  } else {
    const snap = await db.collection("bookings").doc(id).get();
    booking = snap.exists ? bookingFromDoc(snap) : null;
  }
  if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });
  // Case-insensitive under cutover to match getBookingsByEmailInSupabase, which
  // queries a citext column. Comparing exactly here would let a member see a
  // booking in their list and then be told it does not exist when they cancel it.
  const owns = cutover
    ? booking.clientEmail.toLowerCase() === member.email.toLowerCase()
    : booking.clientEmail === member.email;
  if (!owns) return Response.json({ error: "Booking not found." }, { status: 404 });
  if (!["pending", "confirmed"].includes(booking.status)) {
    return Response.json({ error: "This consultation can no longer be cancelled." }, { status: 409 });
  }
  if (booking.scheduledAt.getTime() - Date.now() < settings.cancellationHours * 60 * 60 * 1000) {
    return Response.json({ error: `Please contact the studio for changes within ${settings.cancellationHours} hours.` }, { status: 409 });
  }

  let updated: BookingRecord;
  if (cutover) {
    const result = await updateBookingInSupabase(id, { status: "cancelled" });
    // Vanished between the read above and this write — report it rather than
    // announcing a cancellation that did not happen.
    if (!result) return Response.json({ error: "Booking not found." }, { status: 404 });
    updated = result;
  } else {
    await db.collection("bookings").doc(id).update({ status: "cancelled", updatedAt: FieldValue.serverTimestamp() });
    updated = { ...booking, status: "cancelled", updatedAt: new Date() };
  }
  await recordAudit(
    { id: null, name: `Member · ${member.name}`.slice(0, 120) },
    "booking.cancelled_by_member",
    "booking",
    updated.reference,
    { priorStatus: booking.status, paymentStatus: booking.paymentStatus },
  );
  await sendBookingNotification({
    memberEmail: member.email,
    bookingId: updated.id,
    subject: `${updated.serviceTitle} · ${updated.reference}`,
    body: `Your consultation scheduled for ${updated.scheduledAt.toLocaleString("en", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" })} has been cancelled. The studio will review any applicable payment adjustment.`,
  });
  return Response.json(updated);
}
