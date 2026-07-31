import "server-only";

import { db } from "@/lib/firestore";
import { bookingFromDoc, type BookingRecord } from "@/app/api/bookings/route";

export type ReportRange = "30d" | "90d" | "365d" | "all";

const rangeDays: Record<Exclude<ReportRange, "all">, number> = { "30d": 30, "90d": 90, "365d": 365 };

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function clampRange(value?: string): ReportRange {
  return value === "90d" || value === "365d" || value === "all" ? value : "30d";
}

export function parseReportRange(value?: string) {
  return clampRange(value);
}

type MemberRow = { id: string; plan: string; active: boolean; onboardingComplete: boolean; createdAt: Date };
type ServiceRow = { id: string; title: string; active: boolean };

export async function getAnalytics(requestedRange: ReportRange = "30d") {
  const range = clampRange(requestedRange);
  const [bookingsSnap, membersSnap, servicesSnap] = await Promise.all([
    db.collection("bookings").orderBy("createdAt", "desc").get(),
    db.collection("members").orderBy("createdAt", "asc").get(),
    db.collection("services").get(),
  ]);

  const bookingRows: BookingRecord[] = bookingsSnap.docs.map(bookingFromDoc);
  const memberRows: MemberRow[] = membersSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      plan: data.plan,
      active: data.active,
      onboardingComplete: data.onboardingComplete,
      createdAt: (data.createdAt as FirebaseFirestore.Timestamp)?.toDate() ?? new Date(),
    };
  });
  const serviceRows: ServiceRow[] = servicesSnap.docs.map((doc) => ({ id: doc.id, title: doc.data().title, active: doc.data().active }));

  const now = new Date();
  const allDates = [...bookingRows.map((row) => row.createdAt), ...memberRows.map((row) => row.createdAt)];
  const earliest = allDates.length ? new Date(Math.min(...allDates.map((date) => date.getTime()))) : new Date(now.getTime() - 365 * 86400000);
  const days = range === "all" ? Math.max(30, Math.ceil((now.getTime() - earliest.getTime()) / 86400000)) : rangeDays[range];
  const start = new Date(now.getTime() - days * 86400000);
  const previousStart = new Date(start.getTime() - days * 86400000);

  const currentBookings = bookingRows.filter((row) => row.createdAt >= start && row.createdAt <= now);
  const previousBookings = bookingRows.filter((row) => row.createdAt >= previousStart && row.createdAt < start);
  const currentMembers = memberRows.filter((row) => row.createdAt >= start && row.createdAt <= now);
  const previousMembers = memberRows.filter((row) => row.createdAt >= previousStart && row.createdAt < start);
  const paidRevenue = (rows: BookingRecord[]) => rows.filter((row) => row.paymentStatus === "paid").reduce((sum, row) => sum + row.servicePrice, 0);
  const completedCount = (rows: BookingRecord[]) => rows.filter((row) => row.status === "completed").length;
  const completionRate = (rows: BookingRecord[]) => rows.length ? Math.round(completedCount(rows) / rows.length * 100) : 0;

  const revenue = paidRevenue(currentBookings);
  const previousRevenue = paidRevenue(previousBookings);
  const completion = completionRate(currentBookings);
  const previousCompletion = completionRate(previousBookings);
  const paidBookings = currentBookings.filter((row) => row.paymentStatus === "paid");
  const forecast = bookingRows
    .filter((row) => row.scheduledAt > now && row.status !== "cancelled" && row.paymentStatus === "unpaid")
    .reduce((sum, row) => sum + row.servicePrice, 0);

  const bucketCount = 12;
  const span = Math.max(1, now.getTime() - start.getTime());
  const bucketMs = span / bucketCount;
  const timeline = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(start.getTime() + index * bucketMs);
    const bucketEnd = index === bucketCount - 1 ? new Date(now.getTime() + 1) : new Date(start.getTime() + (index + 1) * bucketMs);
    const bucketBookings = currentBookings.filter((row) => row.createdAt >= bucketStart && row.createdAt < bucketEnd);
    const bucketMembers = currentMembers.filter((row) => row.createdAt >= bucketStart && row.createdAt < bucketEnd);
    return {
      label: days <= 90
        ? bucketStart.toLocaleDateString("en", { month: "short", day: "numeric" })
        : bucketStart.toLocaleDateString("en", { month: "short", year: days > 500 ? "2-digit" : undefined }),
      revenue: paidRevenue(bucketBookings),
      bookings: bucketBookings.length,
      members: bucketMembers.length,
    };
  });

  const serviceMap = new Map<string, { title: string; bookings: number; revenue: number; completed: number }>();
  for (const booking of currentBookings) {
    const entry = serviceMap.get(booking.serviceTitle) ?? { title: booking.serviceTitle, bookings: 0, revenue: 0, completed: 0 };
    entry.bookings += 1;
    if (booking.paymentStatus === "paid") entry.revenue += booking.servicePrice;
    if (booking.status === "completed") entry.completed += 1;
    serviceMap.set(booking.serviceTitle, entry);
  }
  const topServices = [...serviceMap.values()]
    .map((entry) => ({ ...entry, completion: entry.bookings ? Math.round(entry.completed / entry.bookings * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings)
    .slice(0, 6);

  const statuses = ["pending", "confirmed", "completed", "cancelled"].map((status) => ({
    status,
    count: currentBookings.filter((row) => row.status === status).length,
  }));
  const plans = ["member", "premium", "concierge"].map((plan) => ({
    plan,
    count: memberRows.filter((row) => row.plan === plan).length,
  }));

  return {
    range,
    rangeLabel: range === "30d" ? "Last 30 days" : range === "90d" ? "Last 90 days" : range === "365d" ? "Last 12 months" : "All time",
    generatedAt: now,
    metrics: {
      revenue,
      revenueChange: percentChange(revenue, previousRevenue),
      bookings: currentBookings.length,
      bookingsChange: percentChange(currentBookings.length, previousBookings.length),
      newMembers: currentMembers.length,
      membersChange: percentChange(currentMembers.length, previousMembers.length),
      completion,
      completionChange: completion - previousCompletion,
      averageOrder: paidBookings.length ? Math.round(revenue / paidBookings.length) : 0,
      forecast,
      lifetimeRevenue: paidRevenue(bookingRows),
      activeMembers: memberRows.filter((row) => row.active).length,
      onboardingRate: memberRows.length ? Math.round(memberRows.filter((row) => row.onboardingComplete).length / memberRows.length * 100) : 0,
      publishedServices: serviceRows.filter((row) => row.active).length,
    },
    timeline,
    topServices,
    statuses,
    plans,
    recentBookings: bookingRows.slice(0, 6),
    upcomingBookings: bookingRows.filter((row) => row.scheduledAt > now && row.status !== "cancelled").sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()).slice(0, 5),
  };
}
