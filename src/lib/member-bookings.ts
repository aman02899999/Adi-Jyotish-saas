import "server-only";

import { db, withIndexFallback } from "@/lib/firestore";
import { bookingFromDoc, type BookingRecord } from "@/app/api/bookings/route";
import { getBookingsByEmailInSupabase, getNextBookingByEmailInSupabase } from "@/lib/bookings-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

/**
 * A member's own bookings, from whichever provider is live. The dashboard, consultations and
 * predictions pages each queried Firestore for these directly, so after cutover a member would
 * have seen only what they booked before it.
 */
export async function listMemberBookings(email: string): Promise<BookingRecord[]> {
  if (isSupabaseCutoverActive()) return getBookingsByEmailInSupabase(email);
  const snap = await db.collection("bookings").where("clientEmail", "==", email).orderBy("scheduledAt", "desc").get();
  return snap.docs.map(bookingFromDoc);
}

/**
 * The member's next session for the dashboard card. Cancelled bookings are skipped: the card says
 * the session "is reserved", and it used to say so for one the member had cancelled.
 */
export async function getNextMemberBooking(email: string, now = new Date()): Promise<BookingRecord | null> {
  if (isSupabaseCutoverActive()) return getNextBookingByEmailInSupabase(email, now);
  // Firestore allows one inequality per query, so cancelled rows are skipped here rather than by a
  // second filter. A handful of lookahead rows is plenty: a member rarely cancels several in a row.
  const snap = await withIndexFallback(
    () => db.collection("bookings").where("clientEmail", "==", email).where("scheduledAt", ">", now).orderBy("scheduledAt", "asc").limit(10).get(),
    null,
  );
  const next = snap?.docs.map(bookingFromDoc).find((booking) => booking.status !== "cancelled");
  return next ?? null;
}
