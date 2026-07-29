import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, favoritePractitioners, practitionerReviews, practitioners } from "@/db/schema";
import { getPractitionerDirectory } from "@/lib/scheduling";

export type MarketplacePractitioner = Awaited<ReturnType<typeof getPractitionerDirectory>>[number] & {
  rating: number | null;
  reviewCount: number;
  dimensions: { clarity: number; empathy: number; usefulness: number } | null;
};

export async function getMarketplacePractitioners() {
  const [directory, reviews] = await Promise.all([
    getPractitionerDirectory(true),
    db.select().from(practitionerReviews).where(eq(practitionerReviews.status, "published")).orderBy(desc(practitionerReviews.createdAt)),
  ]);
  return directory.map((person) => {
    const personReviews = reviews.filter((review) => review.practitionerId === person.id);
    const average = (field: "rating" | "clarity" | "empathy" | "usefulness") => personReviews.length ? personReviews.reduce((sum, review) => sum + review[field], 0) / personReviews.length : null;
    return {
      ...person,
      rating: average("rating"),
      reviewCount: personReviews.length,
      dimensions: personReviews.length ? { clarity: average("clarity")!, empathy: average("empathy")!, usefulness: average("usefulness")! } : null,
    } satisfies MarketplacePractitioner;
  });
}

export async function getMarketplacePractitioner(slug: string) {
  const people = await getMarketplacePractitioners();
  const practitioner = people.find((person) => person.slug === slug);
  if (!practitioner) return null;
  const reviews = await db.select().from(practitionerReviews).where(and(eq(practitionerReviews.practitionerId, practitioner.id), eq(practitionerReviews.status, "published"))).orderBy(desc(practitionerReviews.createdAt));
  return { practitioner, reviews };
}

export async function getFavoritePractitionerIds(memberId: number) {
  const rows = await db.select({ practitionerId: favoritePractitioners.practitionerId }).from(favoritePractitioners).where(eq(favoritePractitioners.memberId, memberId));
  return rows.map((row) => row.practitionerId);
}

export async function getEligibleReviewBookings(memberEmail: string, practitionerId: number) {
  const completed = await db.select().from(bookings).where(and(eq(bookings.clientEmail, memberEmail), eq(bookings.practitionerId, practitionerId), eq(bookings.status, "completed"))).orderBy(desc(bookings.scheduledAt));
  const existing = await db.select({ bookingId: practitionerReviews.bookingId }).from(practitionerReviews).where(eq(practitionerReviews.practitionerId, practitionerId));
  const reviewed = new Set(existing.map((row) => row.bookingId));
  return completed.filter((booking) => !reviewed.has(booking.id));
}

export async function getAdminReviews() {
  const rows = await db.select({ review: practitionerReviews, practitionerName: practitioners.name, practitionerSlug: practitioners.slug })
    .from(practitionerReviews)
    .innerJoin(practitioners, eq(practitionerReviews.practitionerId, practitioners.id))
    .orderBy(desc(practitionerReviews.createdAt));
  return rows.map((row) => ({ ...row.review, practitionerName: row.practitionerName, practitionerSlug: row.practitionerSlug }));
}
