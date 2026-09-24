import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { db } from "@/lib/firestore";
import { BookingSlotConflictError, insertBookingInSupabase } from "@/lib/bookings-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

/**
 * Booking creation, for both providers.
 *
 * This lives in a lib module rather than in `api/bookings/route.ts` because the
 * only part that has to be atomic is the overlap-check-then-insert, and a
 * transaction cannot be tested from a route handler. Everything around it —
 * payload validation, the lead-time rule, discounting, notifications, the invoice
 * — stays in the route, because none of it needs the datastore's guarantees.
 *
 * `validateAvailableSlot` is still called by the route first, and still matters:
 * it produces the specific "choose another open slot" message and avoids burning
 * a transaction on a slot that was never free. What it cannot do is close the
 * race, because it runs before the insert. That is what this module is for.
 */

export class SlotUnavailableError extends Error {}

export type BookingRecord = {
  id: string;
  reference: string;
  serviceId: string | null;
  serviceTitle: string;
  servicePrice: number;
  serviceDuration: number;
  practitionerId: string | null;
  practitionerName: string | null;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  scheduledAt: Date;
  notes: string | null;
  status: string;
  paymentStatus: string;
  kundliSummary: string | null;
  kundliGeneratedAt: Date | null;
  varshphalSummary: string | null;
  varshphalYear: number | null;
  varshphalGeneratedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewBooking = {
  reference: string;
  serviceId: string;
  serviceTitle: string;
  servicePrice: number;
  serviceDuration: number;
  practitionerId: string;
  practitionerName: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  scheduledAt: Date;
  notes: string | null;
};

/**
 * Inserts the booking, or throws SlotUnavailableError if another booking took the
 * slot in the meantime.
 */
export async function createBookingRecord(values: NewBooking): Promise<BookingRecord> {
  if (isSupabaseCutoverActive()) {
    try {
      return await insertBookingInSupabase(values);
    } catch (error) {
      if (error instanceof BookingSlotConflictError) throw new SlotUnavailableError();
      throw error;
    }
  }

  const bookingsRef = db.collection("bookings");
  return db.runTransaction(async (tx) => {
      const endsAt = new Date(values.scheduledAt.getTime() + values.serviceDuration * 60000);
      // Firestore cannot express "starts + duration > x" server-side, so pull this
      // practitioner's non-cancelled bookings starting before our end time and test
      // overlap here. The transaction supplies the atomicity: if a concurrent
      // booking commits in between, the SDK retries this against fresh reads.
      const candidatesSnap = await tx.get(
        bookingsRef.where("practitionerId", "==", values.practitionerId).where("status", "!=", "cancelled").where("scheduledAt", "<", endsAt),
      );
      const conflict = candidatesSnap.docs.some((doc) => {
        const data = doc.data();
        const bookedStart = (data.scheduledAt as FirebaseFirestore.Timestamp).toDate();
        const bookedEnd = new Date(bookedStart.getTime() + (data.serviceDuration as number) * 60000);
        return bookedEnd > values.scheduledAt;
      });
      if (conflict) throw new SlotUnavailableError();

      const ref = bookingsRef.doc();
      const now = FieldValue.serverTimestamp();
      tx.set(ref, {
        reference: values.reference,
        serviceId: values.serviceId,
        serviceTitle: values.serviceTitle,
        servicePrice: values.servicePrice,
        serviceDuration: values.serviceDuration,
        practitionerId: values.practitionerId,
        practitionerName: values.practitionerName,
        clientName: values.clientName,
        clientEmail: values.clientEmail,
        clientPhone: values.clientPhone,
        birthDate: values.birthDate,
        birthTime: values.birthTime,
        birthPlace: values.birthPlace,
        scheduledAt: values.scheduledAt,
        notes: values.notes,
        status: "pending",
        paymentStatus: "unpaid",
        kundliSummary: null,
        kundliGeneratedAt: null,
        varshphalSummary: null,
        varshphalYear: null,
        varshphalGeneratedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const stamp = new Date();
      return {
        id: ref.id,
        ...values,
        status: "pending",
        paymentStatus: "unpaid",
        kundliSummary: null,
        kundliGeneratedAt: null,
        varshphalSummary: null,
        varshphalYear: null,
        varshphalGeneratedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
      } satisfies BookingRecord;
  });
}
