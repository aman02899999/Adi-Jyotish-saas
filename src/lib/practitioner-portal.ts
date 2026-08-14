import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { bookingFromDoc, type BookingRecord } from "@/app/api/bookings/route";
import { buildKundliChart, KundliEngineError, renderKundliReport } from "@/lib/kundli-engine";
import { decryptPayoutField, encryptPayoutField } from "@/lib/payout-crypto";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { notifyAdmins } from "@/lib/notifications";
import { scanForContactInfo } from "@/lib/content-moderation";

// A request at or below this amount, from a practitioner with at least one prior *paid* payout
// and zero rejections ever, is auto-approved instead of sitting in the "requested" queue —
// admins still have to actually wire the money and enter a transactionRef before anything is
// marked "paid" (see updatePayoutStatus's ALLOWED_PAYOUT_TRANSITIONS below), so this only removes
// the low-risk triage step, never the money-movement step itself.
const AUTO_APPROVE_MAX_AMOUNT = 5000;

export class PayoutError extends Error {}
export class KundliSummaryError extends Error {}
export class ScheduleError extends Error {}

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

/** Instant-chat revenue is a completely separate path from bookings: a member's wallet hold is
 * captured straight onto the chatSessions doc (see chat.ts's endChatSession), with no write-back
 * to `bookings` or any shared earnings ledger. Without summing this too, a practitioner who does
 * paid chat work sees $0 of it reflected here and can never request a payout against it. */
async function chatEarningsForPractitioner(practitionerId: string) {
  const snap = await db.collection("chatSessions").where("practitionerId", "==", practitionerId).where("status", "==", "ended").get();
  let earned = 0;
  for (const doc of snap.docs) earned += (doc.data() as { capturedAmount: number | null }).capturedAmount ?? 0;
  return earned;
}

export async function getPractitionerStats(practitionerId: string) {
  const [bookingsSnap, reviewsSnap, chatEarned, { paidOut, pendingOut }] = await Promise.all([
    db.collection("bookings").where("practitionerId", "==", practitionerId).get(),
    db.collection("practitionerReviews").where("practitionerId", "==", practitionerId).where("status", "==", "published").get(),
    chatEarningsForPractitioner(practitionerId),
    payoutTotalsForPractitioner(practitionerId),
  ]);

  let totalEarned = chatEarned;
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

const SCHEDULE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function updatePractitionerSchedule(practitionerId: string, input: {
  rules: Array<{ weekday: number; startTime: string; endTime: string; active?: boolean }>;
  timeOff: Array<{ startsAt: string; endsAt: string; reason?: string }>;
}) {
  // Previously these invalid entries were silently filter()-dropped rather than rejected — a
  // malformed client payload (or a real bug in the caller) could wipe a practitioner's entire
  // existing schedule while the request still returned 200 "success" with no error surfaced. The
  // old regex (`\d{2}:\d{2}`) also matched nonsense like "99:99" since it never checked the actual
  // hour/minute ranges.
  const rules = input.rules.map((rule) => {
    if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) throw new ScheduleError("Each availability rule needs a valid day of the week.");
    if (!SCHEDULE_TIME_RE.test(rule.startTime) || !SCHEDULE_TIME_RE.test(rule.endTime)) throw new ScheduleError("Enter valid start and end times.");
    if (rule.startTime >= rule.endTime) throw new ScheduleError("Start time must be before end time.");
    return { weekday: rule.weekday, startTime: rule.startTime, endTime: rule.endTime, active: rule.active ?? true };
  });
  // Two active blocks on the same weekday that overlap would mean the practitioner is
  // simultaneously "available" in two places at once — reject rather than silently accept both.
  const activeByWeekday = new Map<number, Array<{ startTime: string; endTime: string }>>();
  for (const rule of rules) {
    if (!rule.active) continue;
    const sameDay = activeByWeekday.get(rule.weekday) ?? [];
    if (sameDay.some((other) => rule.startTime < other.endTime && other.startTime < rule.endTime)) {
      throw new ScheduleError("Two active time blocks on the same day cannot overlap.");
    }
    sameDay.push(rule);
    activeByWeekday.set(rule.weekday, sameDay);
  }

  const timeOff = input.timeOff.map((item) => {
    const startsAt = new Date(item.startsAt);
    const endsAt = new Date(item.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new ScheduleError("Enter valid time-off dates.");
    if (startsAt >= endsAt) throw new ScheduleError("Time off must end after it starts.");
    return { startsAt, endsAt, reason: item.reason?.trim().slice(0, 180) || null };
  });

  const practitionerRef = db.collection("practitioners").doc(practitionerId);
  const rulesCol = practitionerRef.collection("availabilityRules");
  const timeOffCol = practitionerRef.collection("timeOff");

  // Transactional (not a plain read-then-batch): two concurrent saves - a double-click, or the
  // schedule page open in two tabs - would otherwise both read the same existing docs before
  // either commits, so the second call's batch deletes only the (already-gone) docs it read and
  // never touches the first call's newly-created ones, leaving duplicate/conflicting rules and
  // time-off blocks instead of the second save cleanly replacing the first.
  await db.runTransaction(async (tx) => {
    const [existingRules, existingTimeOff] = await Promise.all([tx.get(rulesCol), tx.get(timeOffCol)]);
    for (const doc of existingRules.docs) tx.delete(doc.ref);
    for (const doc of existingTimeOff.docs) tx.delete(doc.ref);
    for (const rule of rules) tx.set(rulesCol.doc(), { ...rule, active: rule.active ?? true });
    for (const item of timeOff) tx.set(timeOffCol.doc(), item);
  });
}

export async function updatePractitionerProfile(practitionerId: string, input: {
  bio?: string; specialties?: string; languages?: string; consultationModes?: string; photoUrl?: string | null; videoUrl?: string | null;
}) {
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.bio !== undefined) patch.bio = input.bio.trim().slice(0, 4000);
  if (input.specialties !== undefined) patch.specialties = input.specialties.trim().slice(0, 400);
  if (input.languages !== undefined) patch.languages = input.languages.trim().slice(0, 240) || "English, Hindi";
  if (input.consultationModes !== undefined) patch.consultationModes = input.consultationModes.trim().slice(0, 160) || "Video, Audio, Chat";
  if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl?.trim() || null;
  if (input.videoUrl !== undefined) patch.videoUrl = input.videoUrl?.trim() || null;

  const ref = db.collection("practitioners").doc(practitionerId);
  await ref.update(patch);
  const updated = await ref.get();

  if (typeof patch.bio === "string") {
    const contactFlag = scanForContactInfo(patch.bio);
    if (contactFlag) {
      const bioForFlag = updated.data() as { name?: string } | undefined;
      getAdminIdsWithPermission("practitioners").then(async (adminIds) => {
        if (!adminIds.length) return;
        await notifyAdmins(adminIds, {
          type: "bio_contact_leak",
          title: `Bio may contain ${contactFlag}`,
          body: `${bioForFlag?.name ?? "A practitioner"}'s bio looks like it contains ${contactFlag} — worth a look before it stays visible on their public profile.`,
          link: "/admin/practitioners",
        });
      }).catch((error) => console.error("Bio contact-leak flag failed", error));
    }
  }

  return { id: updated.id, ...updated.data() };
}

/** Lets a practitioner toggle their own live instant-chat availability — previously only an
 * admin could flip this, which made the "self-service portal" unusable for the one status that
 * genuinely needs to change minute-to-minute (going online/offline for chat). */
export async function setPractitionerOnline(practitionerId: string, online: boolean) {
  const ref = db.collection("practitioners").doc(practitionerId);
  await ref.update({ online, updatedAt: FieldValue.serverTimestamp() });
  return { id: practitionerId, online };
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

  // totalEarned only grows via paid bookings and ended chat sessions, not this action, so it's
  // safe to read outside the transaction — but paidOut/pendingOut come from the payouts
  // collection this function itself writes to, so that read-check-write needs to be atomic or
  // two concurrent requests (double click, two tabs) could both pass the balance check against
  // the same stale total and together request more than the practitioner has actually earned.
  const [bookingsSnap, chatEarned] = await Promise.all([
    db.collection("bookings").where("practitionerId", "==", practitionerId).get(),
    chatEarningsForPractitioner(practitionerId),
  ]);
  let totalEarned = chatEarned;
  for (const doc of bookingsSnap.docs) {
    const row = bookingFromDoc(doc);
    if (row.paymentStatus === "paid" && row.status !== "cancelled") totalEarned += row.servicePrice;
  }

  const ref = payoutsCollection().doc();
  const now = FieldValue.serverTimestamp();
  const autoApproved = await db.runTransaction(async (tx) => {
    const payoutsSnap = await tx.get(payoutsCollection().where("practitionerId", "==", practitionerId));
    let paidOut = 0;
    let pendingOut = 0;
    let hasPriorPaid = false;
    let hasRejection = false;
    for (const doc of payoutsSnap.docs) {
      const data = doc.data() as { amount: number; status: string };
      if (data.status === "paid") { paidOut += data.amount; hasPriorPaid = true; }
      else if (data.status === "requested" || data.status === "approved") pendingOut += data.amount;
      else if (data.status === "rejected") hasRejection = true;
    }
    const availableBalance = Math.max(0, totalEarned - paidOut - pendingOut);
    if (amount > availableBalance) throw new PayoutError(`You can request up to ₹${availableBalance} right now.`);

    const autoApprove = amount <= AUTO_APPROVE_MAX_AMOUNT && hasPriorPaid && !hasRejection;
    tx.set(ref, {
      practitionerId,
      amount,
      currency: "INR",
      status: autoApprove ? "approved" : "requested",
      payoutMethod: "bank_transfer",
      transactionRef: null,
      notes: notes?.trim().slice(0, 500) || null,
      adminNotes: autoApprove ? `Auto-approved: ₹${amount} is under the ₹${AUTO_APPROVE_MAX_AMOUNT} threshold and this practitioner has a clean payout history. Still needs a real transfer + reference to be marked paid.` : null,
      processedBy: autoApprove ? "system:auto-approval" : null,
      requestedAt: now,
      processedAt: autoApprove ? now : null,
      updatedAt: now,
    });
    return autoApprove;
  });

  if (autoApproved) {
    const adminIds = await getAdminIdsWithPermission("billing");
    if (adminIds.length) {
      await notifyAdmins(adminIds, {
        type: "payout_auto_approved",
        title: `Payout auto-approved — ₹${amount}`,
        body: "A small payout request from a practitioner with a clean history was auto-approved. It still needs the actual bank transfer and a transaction reference.",
        link: "/admin/payouts",
      }).catch((error) => console.error("Payout auto-approval notification failed", error));
    }
  }

  return payoutFromSnap(await ref.get());
}

/** Automated stand-in for a manual "does this look like the same person twice" check: the same
 * bank account or UPI ID showing up on more than one practitioner profile is exactly the pattern
 * a multi-accounting practitioner (e.g. banned once, signing up again under a new name) would
 * produce. Decrypts every practitioner's payout details to compare — fine for an admin-only,
 * on-demand list load at this practitioner count, but not something to run on a schedule. */
export async function computeVerificationFlags(): Promise<Map<string, string>> {
  const snap = await db.collection("practitioners").get();
  const byBank = new Map<string, string[]>();
  const byUpi = new Map<string, string[]>();

  for (const doc of snap.docs) {
    const data = doc.data() as { bankAccountNumberEnc?: string; upiIdEnc?: string; isDemoAccount?: boolean };
    if (data.isDemoAccount) continue;
    if (data.bankAccountNumberEnc) {
      const decrypted = decryptPayoutField(data.bankAccountNumberEnc);
      if (decrypted) byBank.set(decrypted, [...(byBank.get(decrypted) ?? []), doc.id]);
    }
    if (data.upiIdEnc) {
      const decrypted = decryptPayoutField(data.upiIdEnc);
      if (decrypted) byUpi.set(decrypted, [...(byUpi.get(decrypted) ?? []), doc.id]);
    }
  }

  const flags = new Map<string, string>();
  for (const ids of byBank.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) flags.set(id, "Shares a bank account with another practitioner profile.");
  }
  for (const ids of byUpi.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const existing = flags.get(id);
      flags.set(id, existing ? `${existing} Also shares a UPI ID.` : "Shares a UPI ID with another practitioner profile.");
    }
  }
  return flags;
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
  // Transactional read-check-write: a plain get()-then-update() lets two concurrent requests (a
  // double-click, or two admins acting on the same payout) both read the same currentStatus and
  // both pass the transition check, so the second silently overwrites the first's
  // adminNotes/transactionRef and re-sends the practitioner-facing email/notification below.
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists) throw new PayoutError("Payout request not found.");

    const currentStatus = (existing.data() as { status: string }).status;
    // No same-status exception: "paid" is deliberately terminal - its allowed-set is empty - so
    // this also blocks ever re-processing an already-paid payout.
    if (!ALLOWED_PAYOUT_TRANSITIONS[currentStatus]?.has(status)) {
      throw new PayoutError(`A ${currentStatus} payout can't be changed to ${status}.`);
    }

    tx.update(ref, {
      status,
      adminNotes: adminNotes?.trim().slice(0, 500) || null,
      transactionRef: transactionRef?.trim().slice(0, 120) || null,
      processedBy: adminId,
      processedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
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

/** Same idea as getBookingKundliSummary, but for an instant-chat session — a scheduled booking
 * captures birth details as part of checkout, but a chat session doesn't, so this reads them off
 * the client's own member profile instead (populated during onboarding). Scoped to sessions the
 * calling practitioner actually owns, and cached on the chatSessions doc the same way. */
export async function getChatMemberKundliSummary(sessionId: string, practitionerId: string) {
  const sessionRef = db.collection("chatSessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new KundliSummaryError("Chat session not found.");
  const sessionData = sessionSnap.data() as { practitionerId: string; memberId: string; kundliSummary?: string };
  if (sessionData.practitionerId !== practitionerId) throw new KundliSummaryError("Chat session not found.");
  if (sessionData.kundliSummary) return { kundliSummary: sessionData.kundliSummary };

  const memberSnap = await db.collection("members").doc(sessionData.memberId).get();
  if (!memberSnap.exists) throw new KundliSummaryError("This client's profile could not be found.");
  const member = memberSnap.data() as { name: string; birthDate: string | null; birthTime: string | null; birthPlace: string | null };
  if (!member.birthDate || !member.birthTime || !member.birthPlace) {
    throw new KundliSummaryError("This client hasn't completed their birth profile yet, so a Kundli can't be generated.");
  }

  let summary: string;
  try {
    const chart = buildKundliChart({ name: member.name, birthDate: member.birthDate, birthTime: member.birthTime, birthPlace: member.birthPlace });
    summary = renderKundliReport(chart);
  } catch (error) {
    if (error instanceof KundliEngineError) throw new KundliSummaryError(error.message);
    throw error;
  }

  await sessionRef.update({ kundliSummary: summary, kundliGeneratedAt: FieldValue.serverTimestamp() });
  return { kundliSummary: summary };
}
