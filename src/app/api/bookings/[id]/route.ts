import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { sendBookingNotification } from "@/lib/messaging";
import { dateInTimeZone, validateAvailableSlot } from "@/lib/scheduling";
import { getStudioSettings } from "@/lib/studio-settings";
import { bookingFromDoc } from "@/app/api/bookings/route";
import { checkBookingCompletionMilestone } from "@/lib/milestones";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import {
  BookingSlotConflictError,
  deleteBookingInSupabase,
  countBookingFinancialDependentsInSupabase,
  getBookingByIdInSupabase,
  updateBookingInSupabase,
} from "@/lib/bookings-supabase";
import type { BookingRecord } from "@/lib/booking-creation";

export const dynamic = "force-dynamic";

class ScheduleConflictError extends Error {}

const statuses = ["pending", "confirmed", "completed", "cancelled"] as const;

type BookingUpdate = {
  status?: string;
  paymentStatus?: string;
  scheduledAt?: string;
  notes?: string;
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "bookings")) return Response.json({ error: "Booking permission required." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json()) as BookingUpdate;
  if (body.status && !statuses.includes(body.status as (typeof statuses)[number])) {
    return Response.json({ error: "Invalid booking status." }, { status: 400 });
  }
  if (body.paymentStatus) {
    return Response.json({ error: "Manage payment changes through the invoice ledger." }, { status: 409 });
  }

  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : undefined;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return Response.json({ error: "Invalid appointment date." }, { status: 400 });

  const cutover = isSupabaseCutoverActive();
  let existing: BookingRecord | null;
  if (cutover) {
    existing = await getBookingByIdInSupabase(id);
  } else {
    const existingSnap = await db.collection("bookings").doc(id).get();
    existing = existingSnap.exists ? bookingFromDoc(existingSnap) : null;
  }
  if (!existing) return Response.json({ error: "Booking not found." }, { status: 404 });

  if (scheduledAt && existing.practitionerId) {
    const settings = await getStudioSettings();
    const available = await validateAvailableSlot({ date: dateInTimeZone(scheduledAt, settings.timezone), duration: existing.serviceDuration, practitionerId: existing.practitionerId, startsAt: scheduledAt, excludeBookingId: existing.id });
    if (!available) return Response.json({ error: "That practitioner is unavailable at the new time." }, { status: 409 });
  }

  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1500) || null : undefined;

  let updated: BookingRecord;
  if (cutover) {
    try {
      // The overlap re-check happens inside updateBookingInSupabase, under the same
      // per-practitioner advisory lock the insert path takes. Firestore retried its
      // transaction on a read conflict; Postgres does not, so the lock is what stops
      // two admins rescheduling the same astrologer onto the same slot.
      const result = await updateBookingInSupabase(id, {
        ...(body.status ? { status: body.status } : {}),
        ...(scheduledAt ? { scheduledAt } : {}),
        ...(notes !== undefined ? { notes } : {}),
      });
      if (!result) return Response.json({ error: "Booking not found." }, { status: 404 });
      updated = result;
    } catch (error) {
      if (error instanceof BookingSlotConflictError) {
        return Response.json({ error: "That practitioner is unavailable at the new time." }, { status: 409 });
      }
      console.error("Booking update failed", error instanceof Error ? error.message : "unknown error");
      return Response.json({ error: "Booking could not be updated." }, { status: 500 });
    }
  } else {
    const ref = db.collection("bookings").doc(id);
    try {
      updated = await db.runTransaction(async (tx) => {
        if (scheduledAt && existing.practitionerId) {
          const endsAt = new Date(scheduledAt.getTime() + existing.serviceDuration * 60000);
          const candidatesSnap = await tx.get(
            db.collection("bookings").where("practitionerId", "==", existing.practitionerId).where("status", "!=", "cancelled").where("scheduledAt", "<", endsAt),
          );
          const conflict = candidatesSnap.docs.some((doc) => {
            if (doc.id === existing.id) return false;
            const data = doc.data();
            const bookedStart = (data.scheduledAt as FirebaseFirestore.Timestamp).toDate();
            const bookedEnd = new Date(bookedStart.getTime() + (data.serviceDuration as number) * 60000);
            return bookedEnd > scheduledAt;
          });
          if (conflict) throw new ScheduleConflictError();
        }
        const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
        if (body.status) patch.status = body.status;
        if (scheduledAt) patch.scheduledAt = scheduledAt;
        if (typeof body.notes === "string") patch.notes = body.notes.trim().slice(0, 1500) || null;
        tx.update(ref, patch);
        return {
          ...existing,
          ...(body.status ? { status: body.status } : {}),
          ...(scheduledAt ? { scheduledAt } : {}),
          ...(typeof body.notes === "string" ? { notes: body.notes.trim().slice(0, 1500) || null } : {}),
          updatedAt: new Date(),
        };
      });
    } catch (error) {
      if (error instanceof ScheduleConflictError) {
        return Response.json({ error: "That practitioner is unavailable at the new time." }, { status: 409 });
      }
      console.error("Booking update transaction failed", error instanceof Error ? error.message : "unknown error");
      return Response.json({ error: "Booking could not be updated." }, { status: 500 });
  }
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
      body.scheduledAt ? `New appointment: ${updated.scheduledAt.toLocaleString("en", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" })}.` : "",
    ].filter(Boolean).join(" ");
    await sendBookingNotification({ memberEmail: updated.clientEmail, bookingId: updated.id, subject: `${updated.serviceTitle} · ${updated.reference}`, body: `Your consultation was updated. ${changes}` });
  }
  if (body.status === "completed" && existing.status !== "completed") {
    checkBookingCompletionMilestone().catch((error) => console.error("Booking milestone check failed", error));
  }
  return Response.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "bookings")) return Response.json({ error: "Booking permission required." }, { status: 403 });

  const { id } = await params;

  let reference: string;
  if (isSupabaseCutoverActive()) {
    // Five tables reference bookings with ON DELETE SET NULL, so unlike Firestore
    // the delete would not fail — it would silently detach the rows. Detaching an
    // invoice or a payment from the booking it was raised for is the part that
    // cannot be undone afterwards, so those two block. Cancel the booking instead.
    const dependents = await countBookingFinancialDependentsInSupabase(id);
    if (dependents.invoices + dependents.payments > 0) {
      return Response.json({
        error: `This booking has ${dependents.invoices} invoice${dependents.invoices === 1 ? "" : "s"} and ${dependents.payments} payment${dependents.payments === 1 ? "" : "s"} against it. Cancel it instead of deleting it so the ledger keeps its booking.`,
      }, { status: 409 });
    }
    const deleted = await deleteBookingInSupabase(id);
    if (deleted === null) return Response.json({ error: "Booking not found." }, { status: 404 });
    reference = deleted;
  } else {
    const ref = db.collection("bookings").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ error: "Booking not found." }, { status: 404 });
    reference = snap.data()?.reference as string;
    await ref.delete();
  }
  await recordAudit(admin, "booking.deleted", "booking", reference);
  return Response.json({ ok: true, id });
}
