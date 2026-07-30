import "server-only";

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  availabilityRules,
  bookings,
  practitionerPayouts,
  practitionerReviews,
  practitionerTimeOff,
  practitioners,
} from "@/db/schema";
import { buildKundliChart, KundliEngineError, renderKundliReport } from "@/lib/kundli-engine";

export class PayoutError extends Error {}
export class KundliSummaryError extends Error {}

export async function getPractitionerStats(practitionerId: number) {
  const [earningsRow] = await db.select({
    totalEarned: sql<number>`coalesce(sum(${bookings.servicePrice}) filter (where ${bookings.paymentStatus} = 'paid'), 0)::int`,
    completedCount: sql<number>`count(*) filter (where ${bookings.status} = 'completed')::int`,
    upcomingCount: sql<number>`count(*) filter (where ${bookings.status} in ('pending','confirmed') and ${bookings.scheduledAt} >= now())::int`,
  }).from(bookings).where(eq(bookings.practitionerId, practitionerId));

  const [payoutRow] = await db.select({
    paidOut: sql<number>`coalesce(sum(${practitionerPayouts.amount}) filter (where ${practitionerPayouts.status} = 'paid'), 0)::int`,
    pendingOut: sql<number>`coalesce(sum(${practitionerPayouts.amount}) filter (where ${practitionerPayouts.status} in ('requested','approved')), 0)::int`,
  }).from(practitionerPayouts).where(eq(practitionerPayouts.practitionerId, practitionerId));

  const [reviewRow] = await db.select({
    avgRating: sql<number>`coalesce(avg(${practitionerReviews.rating}), 0)::float`,
    reviewCount: sql<number>`count(*)::int`,
  }).from(practitionerReviews).where(and(eq(practitionerReviews.practitionerId, practitionerId), eq(practitionerReviews.status, "published")));

  const totalEarned = earningsRow?.totalEarned ?? 0;
  const paidOut = payoutRow?.paidOut ?? 0;
  const pendingOut = payoutRow?.pendingOut ?? 0;
  const availableBalance = Math.max(0, totalEarned - paidOut - pendingOut);

  return {
    totalEarned,
    completedCount: earningsRow?.completedCount ?? 0,
    upcomingCount: earningsRow?.upcomingCount ?? 0,
    paidOut,
    pendingOut,
    availableBalance,
    avgRating: Math.round((reviewRow?.avgRating ?? 0) * 10) / 10,
    reviewCount: reviewRow?.reviewCount ?? 0,
  };
}

export async function getPractitionerBookings(practitionerId: number) {
  return db.select().from(bookings).where(eq(bookings.practitionerId, practitionerId)).orderBy(desc(bookings.scheduledAt));
}

export async function getPractitionerReviews(practitionerId: number) {
  return db.select().from(practitionerReviews)
    .where(and(eq(practitionerReviews.practitionerId, practitionerId), eq(practitionerReviews.status, "published")))
    .orderBy(desc(practitionerReviews.createdAt));
}

export async function getPractitionerSchedule(practitionerId: number) {
  const [rules, timeOff] = await Promise.all([
    db.select().from(availabilityRules).where(eq(availabilityRules.practitionerId, practitionerId)).orderBy(asc(availabilityRules.weekday)),
    db.select().from(practitionerTimeOff).where(and(eq(practitionerTimeOff.practitionerId, practitionerId), gte(practitionerTimeOff.endsAt, new Date()))).orderBy(asc(practitionerTimeOff.startsAt)),
  ]);
  return { rules, timeOff };
}

export async function updatePractitionerSchedule(practitionerId: number, input: {
  rules: Array<{ weekday: number; startTime: string; endTime: string; active?: boolean }>;
  timeOff: Array<{ startsAt: string; endsAt: string; reason?: string }>;
}) {
  const rules = input.rules.filter((rule) =>
    Number.isInteger(rule.weekday) && rule.weekday >= 0 && rule.weekday <= 6 &&
    /^\d{2}:\d{2}$/.test(rule.startTime) && /^\d{2}:\d{2}$/.test(rule.endTime) && rule.startTime < rule.endTime);
  const timeOff = input.timeOff
    .map((item) => ({ startsAt: new Date(item.startsAt), endsAt: new Date(item.endsAt), reason: item.reason?.trim().slice(0, 180) || null }))
    .filter((item) => !Number.isNaN(item.startsAt.getTime()) && !Number.isNaN(item.endsAt.getTime()) && item.startsAt < item.endsAt);

  await db.transaction(async (tx) => {
    await tx.delete(availabilityRules).where(eq(availabilityRules.practitionerId, practitionerId));
    await tx.delete(practitionerTimeOff).where(eq(practitionerTimeOff.practitionerId, practitionerId));
    if (rules.length) await tx.insert(availabilityRules).values(rules.map((rule) => ({ ...rule, practitionerId, active: rule.active ?? true })));
    if (timeOff.length) await tx.insert(practitionerTimeOff).values(timeOff.map((item) => ({ ...item, practitionerId })));
  });
}

export async function updatePractitionerProfile(practitionerId: number, input: {
  bio?: string; specialties?: string; languages?: string; consultationModes?: string; photoUrl?: string | null;
}) {
  const patch: Partial<typeof practitioners.$inferInsert> = { updatedAt: new Date() };
  if (input.bio !== undefined) patch.bio = input.bio.trim().slice(0, 4000);
  if (input.specialties !== undefined) patch.specialties = input.specialties.trim().slice(0, 400);
  if (input.languages !== undefined) patch.languages = input.languages.trim().slice(0, 240) || "English, Hindi";
  if (input.consultationModes !== undefined) patch.consultationModes = input.consultationModes.trim().slice(0, 160) || "Video, Audio, Chat";
  if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl?.trim() || null;

  const [updated] = await db.update(practitioners).set(patch).where(eq(practitioners.id, practitionerId)).returning();
  return updated;
}

export async function getPractitionerPayouts(practitionerId: number) {
  return db.select().from(practitionerPayouts).where(eq(practitionerPayouts.practitionerId, practitionerId)).orderBy(desc(practitionerPayouts.requestedAt));
}

export async function requestPayout(practitionerId: number, amount: number, notes?: string) {
  if (!Number.isInteger(amount) || amount < 100) throw new PayoutError("Enter an amount of at least ₹100.");
  const stats = await getPractitionerStats(practitionerId);
  if (amount > stats.availableBalance) throw new PayoutError(`You can request up to ₹${stats.availableBalance} right now.`);

  const [created] = await db.insert(practitionerPayouts).values({
    practitionerId,
    amount,
    notes: notes?.trim().slice(0, 500) || null,
  }).returning();
  return created;
}

export async function getAllPayoutsAdmin(status?: string) {
  const rows = await db.select({ payout: practitionerPayouts, practitionerName: practitioners.name, practitionerEmail: practitioners.email })
    .from(practitionerPayouts)
    .innerJoin(practitioners, eq(practitionerPayouts.practitionerId, practitioners.id))
    .orderBy(desc(practitionerPayouts.requestedAt));
  const filtered = status && status !== "all" ? rows.filter((row) => row.payout.status === status) : rows;
  return filtered.map((row) => ({ ...row.payout, practitionerName: row.practitionerName, practitionerEmail: row.practitionerEmail }));
}

export async function updatePayoutStatus(id: number, status: "approved" | "paid" | "rejected", adminId: number, adminNotes?: string) {
  const [updated] = await db.update(practitionerPayouts).set({
    status,
    adminNotes: adminNotes?.trim().slice(0, 500) || null,
    processedBy: adminId,
    processedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(practitionerPayouts.id, id)).returning();
  if (!updated) throw new PayoutError("Payout request not found.");
  return updated;
}

/** Generates (or returns the cached) Kundli summary for a booking's client from the real chart
 * engine, using the birth details already captured at booking time. No AI involved. */
export async function getBookingKundliSummary(bookingId: number, practitionerId: number) {
  const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.practitionerId, practitionerId))).limit(1);
  if (!booking) throw new KundliSummaryError("Booking not found.");
  if (booking.kundliSummary) return booking;

  let summary: string;
  try {
    const chart = buildKundliChart({ name: booking.clientName, birthDate: booking.birthDate, birthTime: booking.birthTime, birthPlace: booking.birthPlace });
    summary = renderKundliReport(chart);
  } catch (error) {
    if (error instanceof KundliEngineError) throw new KundliSummaryError(error.message);
    throw error;
  }

  const [updated] = await db.update(bookings).set({ kundliSummary: summary, kundliGeneratedAt: new Date() }).where(eq(bookings.id, bookingId)).returning();
  return updated ?? booking;
}
