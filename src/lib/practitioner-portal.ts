import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { bookingFromDoc, type BookingRecord } from "@/app/api/bookings/route";
import { buildKundliChart, KundliEngineError, renderKundliReport } from "@/lib/kundli-engine";
import { decryptPayoutField, encryptPayoutField } from "@/lib/payout-crypto";

export class PayoutError extends Error {}
export class KundliSummaryError extends Error {}

export type PractitionerPayout = {
  id: string;
  practitionerId: string;
  amount: number;
  currency: string;
  status: string;
  payoutMethod: string;
  transactionRef: string | null;
  notes: string | null;
  adminNotes: string | null;
  processedBy: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  updatedAt: Date;
};

function toDate(value: FirebaseFirestore.Timestamp | Date | undefined | null): Date {
  if (!value) return new Date();
  return value instanceof Date ? value : value.toDate();
}
function toDateOrNull(value: FirebaseFirestore.Timestamp | Date | undefined | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : value.toDate();
}

function payoutsCollection() {
  return db.collection("practitionerPayouts");
}

function payoutFromSnap(snap: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot): PractitionerPayout {
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    practitionerId: data.practitionerId as string,
    amount: data.amount as number,
    currency: (data.currency as string) ?? "INR",
    status: (data.status as string) ?? "requested",
    payoutMethod: (data.payoutMethod as string) ?? "bank_transfer",
    transactionRef: (data.transactionRef as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    adminNotes: (data.adminNotes as string | null) ?? null,
    processedBy: (data.processedBy as string | null) ?? null,
    requestedAt: toDate(data.requestedAt as FirebaseFirestore.Timestamp),
    processedAt: toDateOrNull(data.processedAt as FirebaseFirestore.Timestamp | undefined),
    updatedAt: toDate(data.updatedAt as FirebaseFirestore.Timestamp),
  };
}

async function payoutTotalsForPractitioner(practitionerId: string) {
  const snap = await payoutsCollection().where("practitionerId", "==", practitionerId).get();
  let paidOut = 0;
  let pendingOut = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as { amount: number; status: string };
    if (data.status === "paid") paidOut += data.amount;
    else if (data.status === "requested" || data.status === "approved") pendingOut += data.amount;
  }
  return { paidOut, pendingOut };
}

export async function getPractitionerStats(practitionerId: string) {
  const [bookingsSnap, reviewsSnap, { paidOut, pendingOut }] = await Promise.all([
    db.collection("bookings").where("practitionerId", "==", practitionerId).get(),
    db.collection("practitionerReviews").where("practitionerId", "==", practitionerId).where("status", "==", "published").get(),
    payoutTotalsForPractitioner(practitionerId),
  ]);

  let totalEarned = 0;
  let completedCount = 0;
  let upcomingCount = 0;
  const now = Date.now();
  for (const doc of bookingsSnap.docs) {
    const row = bookingFromDoc(doc);
    // A member self-cancel only flips `status`, not `paymentStatus` (refunds are handled
    // separately) — without this check a cancelled-but-still-"paid" booking would count toward
    // earnings the practitioner could then request as a payout.
    if (row.paymentStatus === "paid" && row.status !== "cancelled") totalEarned += row.servicePrice;
    if (row.status === "completed") completedCount += 1;
    if ((row.status === "pending" || row.status === "confirmed") && row.scheduledAt.getTime() >= now) upcomingCount += 1;
  }

  let ratingSum = 0;
  for (const doc of reviewsSnap.docs) {
    ratingSum += (doc.data().rating as number) ?? 0;
  }
  const reviewCount = reviewsSnap.size;
  const avgRating = reviewCount ? ratingSum / reviewCount : 0;

  const availableBalance = Math.max(0, totalEarned - paidOut - pendingOut);

  return {
    totalEarned,
    completedCount,
    upcomingCount,
    paidOut,
    pendingOut,
    availableBalance,
    avgRating: Math.round(avgRating * 10) / 10,
    reviewCount,
  };
}

export async function getPractitionerBookings(practitionerId: string): Promise<BookingRecord[]> {
  const snap = await db.collection("bookings").where("practitionerId", "==", practitionerId).orderBy("scheduledAt", "desc").get();
  return snap.docs.map((doc) => bookingFromDoc(doc));
}

export type PractitionerReview = {
  id: string;
  reviewerName: string;
  rating: number;
  clarity: number;
  empathy: number;
  usefulness: number;
  body: string;
  createdAt: Date;
};

export async function getPractitionerReviews(practitionerId: string): Promise<PractitionerReview[]> {
  const snap = await db.collection("practitionerReviews")
    .where("practitionerId", "==", practitionerId)
    .where("status", "==", "published")
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data() as { reviewerName: string; rating: number; clarity: number; empathy: number; usefulness: number; body: string; createdAt: FirebaseFirestore.Timestamp };
    return { id: doc.id, reviewerName: data.reviewerName, rating: data.rating, clarity: data.clarity, empathy: data.empathy, usefulness: data.usefulness, body: data.body, createdAt: data.createdAt?.toDate() ?? new Date() };
  });
}

export async function getPractitionerSchedule(practitionerId: string) {
  const practitionerRef = db.collection("practitioners").doc(practitionerId);
  const [rulesSnap, timeOffSnap] = await Promise.all([
    practitionerRef.collection("availabilityRules").orderBy("weekday", "asc").get(),
    practitionerRef.collection("timeOff").where("endsAt", ">=", new Date()).orderBy("endsAt", "asc").get(),
  ]);
  const rules = rulesSnap.docs.map((doc) => {
    const data = doc.data() as { weekday: number; startTime: string; endTime: string; active: boolean };
    return { id: doc.id, weekday: data.weekday, startTime: data.startTime, endTime: data.endTime, active: data.active };
  });
  const timeOff = timeOffSnap.docs
    .map((doc) => {
      const data = doc.data() as { startsAt: FirebaseFirestore.Timestamp; endsAt: FirebaseFirestore.Timestamp; reason: string | null };
      return { id: doc.id, reason: data.reason, startsAt: toDate(data.startsAt), endsAt: toDate(data.endsAt) };
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return { rules, timeOff };
}

export async function updatePractitionerSchedule(practitionerId: string, input: {
  rules: Array<{ weekday: number; startTime: string; endTime: string; active?: boolean }>;
  timeOff: Array<{ startsAt: string; endsAt: string; reason?: string }>;
}) {
  const rules = input.rules.filter((rule) =>
    Number.isInteger(rule.weekday) && rule.weekday >= 0 && rule.weekday <= 6 &&
    /^\d{2}:\d{2}$/.test(rule.startTime) && /^\d{2}:\d{2}$/.test(rule.endTime) && rule.startTime < rule.endTime);
  const timeOff = input.timeOff
    .map((item) => ({ startsAt: new Date(item.startsAt), endsAt: new Date(item.endsAt), reason: item.reason?.trim().slice(0, 180) || null }))
    .filter((item) => !Number.isNaN(item.startsAt.getTime()) && !Number.isNaN(item.endsAt.getTime()) && item.startsAt < item.endsAt);

  const practitionerRef = db.collection("practitioners").doc(practitionerId);
  const rulesCol = practitionerRef.collection("availabilityRules");
  const timeOffCol = practitionerRef.collection("timeOff");

  const [existingRules, existingTimeOff] = await Promise.all([rulesCol.get(), timeOffCol.get()]);

  const batch = db.batch();
  for (const doc of existingRules.docs) batch.delete(doc.ref);
  for (const doc of existingTimeOff.docs) batch.delete(doc.ref);
  for (const rule of rules) batch.set(rulesCol.doc(), { ...rule, active: rule.active ?? true });
  for (const item of timeOff) batch.set(timeOffCol.doc(), item);
  await batch.commit();
}

export async function updatePractitionerProfile(practitionerId: string, input: {
  bio?: string; specialties?: string; languages?: string; consultationModes?: string; photoUrl?: string | null;
}) {
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.bio !== undefined) patch.bio = input.bio.trim().slice(0, 4000);
  if (input.specialties !== undefined) patch.specialties = input.specialties.trim().slice(0, 400);
  if (input.languages !== undefined) patch.languages = input.languages.trim().slice(0, 240) || "English, Hindi";
  if (input.consultationModes !== undefined) patch.consultationModes = input.consultationModes.trim().slice(0, 160) || "Video, Audio, Chat";
  if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl?.trim() || null;

  const ref = db.collection("practitioners").doc(practitionerId);
  await ref.update(patch);
  const updated = await ref.get();
  return { id: updated.id, ...updated.data() };
}

// --- practitionerPayouts -------------------------------------------------------------------

export async function getPractitionerPayouts(practitionerId: string): Promise<PractitionerPayout[]> {
  const snap = await payoutsCollection().where("practitionerId", "==", practitionerId).orderBy("requestedAt", "desc").get();
  return snap.docs.map((doc) => payoutFromSnap(doc));
}

export async function requestPayout(practitionerId: string, amount: number, notes?: string): Promise<PractitionerPayout> {
  if (!Number.isInteger(amount) || amount < 100) throw new PayoutError("Enter an amount of at least ₹100.");

  const practitionerSnap = await db.collection("practitioners").doc(practitionerId).get();
  if (practitionerSnap.data()?.isDemoAccount) {
    throw new PayoutError("Demo accounts can't request payouts.");
  }

  // totalEarned only grows via paid bookings, not this action, so it's safe to read outside the
  // transaction — but paidOut/pendingOut come from the payouts collection this function itself
  // writes to, so that read-check-write needs to be atomic or two concurrent requests (double
  // click, two tabs) could both pass the balance check against the same stale total and together
  // request more than the practitioner has actually earned.
  const bookingsSnap = await db.collection("bookings").where("practitionerId", "==", practitionerId).get();
  let totalEarned = 0;
  for (const doc of bookingsSnap.docs) {
    const row = bookingFromDoc(doc);
    if (row.paymentStatus === "paid" && row.status !== "cancelled") totalEarned += row.servicePrice;
  }

  const ref = payoutsCollection().doc();
  const now = FieldValue.serverTimestamp();
  await db.runTransaction(async (tx) => {
    const payoutsSnap = await tx.get(payoutsCollection().where("practitionerId", "==", practitionerId));
    let paidOut = 0;
    let pendingOut = 0;
    for (const doc of payoutsSnap.docs) {
      const data = doc.data() as { amount: number; status: string };
      if (data.status === "paid") paidOut += data.amount;
      else if (data.status === "requested" || data.status === "approved") pendingOut += data.amount;
    }
    const availableBalance = Math.max(0, totalEarned - paidOut - pendingOut);
    if (amount > availableBalance) throw new PayoutError(`You can request up to ₹${availableBalance} right now.`);

    tx.set(ref, {
      practitionerId,
      amount,
      currency: "INR",
      status: "requested",
      payoutMethod: "bank_transfer",
      transactionRef: null,
      notes: notes?.trim().slice(0, 500) || null,
      adminNotes: null,
      processedBy: null,
      requestedAt: now,
      processedAt: null,
      updatedAt: now,
    });
  });
  return payoutFromSnap(await ref.get());
}

type PractitionerLite = { name: string; email: string; bankAccountName: string | null; bankAccountNumber: string | null; bankIfsc: string | null; upiId: string | null };

async function practitionerLiteById(practitionerId: string): Promise<PractitionerLite> {
  const snap = await db.collection("practitioners").doc(practitionerId).get();
  const data = snap.data() as Record<string, unknown> | undefined;
  const bankAccountNumberEnc = data?.bankAccountNumberEnc as string | undefined;
  const upiIdEnc = data?.upiIdEnc as string | undefined;
  return {
    name: (data?.name as string | undefined) ?? "Unknown practitioner",
    email: (data?.email as string | undefined) ?? "",
    bankAccountName: (data?.bankAccountName as string | undefined) ?? null,
    bankAccountNumber: bankAccountNumberEnc ? decryptPayoutField(bankAccountNumberEnc) : null,
    bankIfsc: (data?.bankIfsc as string | undefined) ?? null,
    upiId: upiIdEnc ? decryptPayoutField(upiIdEnc) : null,
  };
}

export async function getAllPayoutsAdmin(status?: string) {
  const query = status && status !== "all"
    ? payoutsCollection().where("status", "==", status).orderBy("requestedAt", "desc")
    : payoutsCollection().orderBy("requestedAt", "desc");
  const snap = await query.get();
  const payouts = snap.docs.map((doc) => payoutFromSnap(doc));
  const practitionerIds = Array.from(new Set(payouts.map((payout) => payout.practitionerId)));
  const practitionerLites = await Promise.all(practitionerIds.map((id) => practitionerLiteById(id)));
  const practitionerById = new Map(practitionerIds.map((id, index) => [id, practitionerLites[index]]));

  return payouts.map((payout) => {
    const practitioner = practitionerById.get(payout.practitionerId);
    return {
      ...payout,
      practitionerName: practitioner?.name ?? "Unknown practitioner",
      practitionerEmail: practitioner?.email ?? "",
      bankAccountName: practitioner?.bankAccountName ?? null,
      bankAccountNumber: practitioner?.bankAccountNumber ?? null,
      bankIfsc: practitioner?.bankIfsc ?? null,
      upiId: practitioner?.upiId ?? null,
    };
  });
}

// Once "paid", a payout is terminal — no further status changes, so a record of real money sent
// can't be silently flipped or overwritten later. "rejected" can still be reconsidered to
// "approved", but not jumped straight to "paid" (must go through approval again first).
const ALLOWED_PAYOUT_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  requested: new Set(["approved", "rejected"]),
  approved: new Set(["paid", "rejected"]),
  rejected: new Set(["approved"]),
  paid: new Set(),
};

export async function updatePayoutStatus(id: string, status: "approved" | "paid" | "rejected", adminId: string, adminNotes?: string, transactionRef?: string): Promise<PractitionerPayout> {
  if (status === "paid" && !transactionRef?.trim()) throw new PayoutError("Enter a bank transaction reference before marking this payout paid.");
  const ref = payoutsCollection().doc(id);
  const existing = await ref.get();
  if (!existing.exists) throw new PayoutError("Payout request not found.");

  const currentStatus = (existing.data() as { status: string }).status;
  if (currentStatus !== status && !ALLOWED_PAYOUT_TRANSITIONS[currentStatus]?.has(status)) {
    throw new PayoutError(`A ${currentStatus} payout can't be changed to ${status}.`);
  }

  await ref.update({
    status,
    adminNotes: adminNotes?.trim().slice(0, 500) || null,
    transactionRef: transactionRef?.trim().slice(0, 120) || null,
    processedBy: adminId,
    processedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return payoutFromSnap(await ref.get());
}

export async function updatePractitionerPayoutDetails(practitionerId: string, input: { bankAccountName: string; bankAccountNumber: string; bankIfsc: string; upiId: string }) {
  const bankAccountName = input.bankAccountName.trim().slice(0, 120);
  const bankAccountNumber = input.bankAccountNumber.trim().slice(0, 34);
  const bankIfsc = input.bankIfsc.trim().toUpperCase().slice(0, 20);
  const upiId = input.upiId.trim().slice(0, 80);

  if (bankAccountNumber && (!bankAccountName || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc))) {
    throw new PayoutError("Enter the account holder name and a valid 11-character IFSC code.");
  }
  if (upiId && !/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId)) {
    throw new PayoutError("Enter a valid UPI ID (e.g. name@bank).");
  }

  // Blank bank/UPI fields mean "keep what's already saved" (the form never pre-fills
  // secrets), so only touch a group of fields when its input was actually provided.
  await db.collection("practitioners").doc(practitionerId).update({
    ...(bankAccountNumber
      ? {
          bankAccountName,
          bankAccountNumberEnc: encryptPayoutField(bankAccountNumber),
          bankIfsc,
        }
      : {}),
    ...(upiId ? { upiIdEnc: encryptPayoutField(upiId) } : {}),
    payoutDetailsUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Generates (or returns the cached) Kundli summary for a booking's client from the real chart
 * engine, using the birth details already captured at booking time. No AI involved. */
export async function getBookingKundliSummary(bookingId: string, practitionerId: string) {
  const ref = db.collection("bookings").doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) throw new KundliSummaryError("Booking not found.");
  const booking = bookingFromDoc(snap);
  if (booking.practitionerId !== practitionerId) throw new KundliSummaryError("Booking not found.");
  if (booking.kundliSummary) return booking;

  let summary: string;
  try {
    const chart = buildKundliChart({ name: booking.clientName, birthDate: booking.birthDate, birthTime: booking.birthTime, birthPlace: booking.birthPlace });
    summary = renderKundliReport(chart);
  } catch (error) {
    if (error instanceof KundliEngineError) throw new KundliSummaryError(error.message);
    throw error;
  }

  await ref.update({ kundliSummary: summary, kundliGeneratedAt: FieldValue.serverTimestamp() });
  return { ...booking, kundliSummary: summary, kundliGeneratedAt: new Date() };
}
