import "server-only";

import { db } from "@/lib/firestore";
import { claimDueBookingRemindersInSupabase, type BookingReminderRow } from "@/lib/bookings-supabase";
import { genericNotificationEmailHtml, sendEmail } from "@/lib/email";
import { sendBookingNotification } from "@/lib/messaging";
import { getSiteUrl } from "@/lib/site-url";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

/**
 * Pre-session reminders.
 *
 * The FAQ promises members a reminder as their consultation approaches. Nothing
 * in the app runs on its own, so this is called from /api/cron/booking-reminders,
 * which the scheduled workflow hits every 15 minutes. A run finds every booking
 * starting within the next day that has not been reminded for its current time,
 * claims it, then sends one email and one message in the booking's thread.
 *
 * The claim happens before the send, so delivery is at most once: two
 * overlapping runs never both remind the same booking, and a send that fails
 * after the claim is logged rather than retried on the next run. A missed
 * reminder is a smaller harm than a member getting the same one every 15
 * minutes because the mail provider is returning errors.
 *
 * The claim stores the appointment time it was sent for, not a flag, so a
 * booking the admin moves to a new slot becomes due again for the new time.
 */

export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A booking made this close to now has only just had its confirmation. */
export const REMINDER_MIN_AGE_MS = 60 * 60 * 1000;

const REMINDABLE_STATUSES = new Set(["pending", "confirmed"]);

export type BookingReminderResult = { claimed: number; emailed: number; messaged: number; failed: number };

export async function claimDueBookingReminders(now: Date): Promise<BookingReminderRow[]> {
  const dueBefore = new Date(now.getTime() + REMINDER_WINDOW_MS);
  const createdBefore = new Date(now.getTime() - REMINDER_MIN_AGE_MS);

  if (isSupabaseCutoverActive()) {
    return claimDueBookingRemindersInSupabase(now, dueBefore, createdBefore);
  }

  // One range filter needs no composite index; status and age are checked in
  // memory, and again inside the transaction against the fresh read.
  const snap = await db.collection("bookings").where("scheduledAt", ">", now).where("scheduledAt", "<=", dueBefore).get();
  const claimed: BookingReminderRow[] = [];
  for (const candidate of snap.docs) {
    const row = await db.runTransaction(async (tx) => {
      const doc = await tx.get(candidate.ref);
      const data = doc.data();
      if (!data) return null;
      const scheduledAt = (data.scheduledAt as FirebaseFirestore.Timestamp | undefined)?.toDate();
      const createdAt = (data.createdAt as FirebaseFirestore.Timestamp | undefined)?.toDate();
      const sentFor = (data.reminderSentFor as FirebaseFirestore.Timestamp | undefined)?.toDate();
      if (!scheduledAt || scheduledAt <= now || scheduledAt > dueBefore) return null;
      if (!createdAt || createdAt > createdBefore) return null;
      if (!REMINDABLE_STATUSES.has(String(data.status))) return null;
      if (sentFor && sentFor.getTime() === scheduledAt.getTime()) return null;

      tx.update(doc.ref, { reminderSentFor: scheduledAt });
      return {
        id: doc.id,
        reference: String(data.reference ?? ""),
        serviceTitle: String(data.serviceTitle ?? ""),
        practitionerName: String(data.practitionerName ?? ""),
        clientName: String(data.clientName ?? ""),
        clientEmail: String(data.clientEmail ?? ""),
        scheduledAt,
      } satisfies BookingReminderRow;
    });
    if (row) claimed.push(row);
  }
  return claimed;
}

export async function sendDueBookingReminders(now = new Date()): Promise<BookingReminderResult> {
  const due = await claimDueBookingReminders(now);
  const result: BookingReminderResult = { claimed: due.length, emailed: 0, messaged: 0, failed: 0 };
  const ctaUrl = new URL("/dashboard/consultations", getSiteUrl()).toString();

  for (const booking of due) {
    if (!booking.clientEmail) {
      result.failed += 1;
      continue;
    }
    const when = booking.scheduledAt.toLocaleString("en", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" });
    const withWhom = booking.practitionerName ? ` with ${booking.practitionerName}` : "";
    const body = `Your ${booking.serviceTitle || "consultation"}${withWhom} is on ${when} (IST). Reference: ${booking.reference}.`;
    let ok = true;

    try {
      const message = await sendBookingNotification({
        memberEmail: booking.clientEmail,
        bookingId: booking.id,
        subject: `${booking.serviceTitle} · ${booking.reference}`,
        body: `Reminder: ${body}`,
      });
      if (message) result.messaged += 1;
    } catch (error) {
      ok = false;
      console.error(`Booking reminder message failed for ${booking.id}`, error instanceof Error ? error.message : "unknown error");
    }

    try {
      const email = await sendEmail({
        to: booking.clientEmail,
        subject: `Reminder: your consultation · ${booking.reference}`,
        html: genericNotificationEmailHtml({
          title: "Your consultation is coming up",
          name: booking.clientName,
          body,
          ctaLabel: "View your booking",
          ctaUrl,
        }),
      });
      if (email.sent) result.emailed += 1;
    } catch (error) {
      ok = false;
      console.error(`Booking reminder email failed for ${booking.id}`, error instanceof Error ? error.message : "unknown error");
    }

    if (!ok) result.failed += 1;
  }
  return result;
}
