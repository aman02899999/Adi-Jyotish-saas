import "server-only";

import { and, desc, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, practitionerReviews, practitioners } from "@/db/schema";
import { getMarketplacePractitioners } from "@/lib/marketplace";

export async function getHomepageStats() {
  const [[bookingRow], [practitionerRow], [reviewRow]] = await Promise.all([
    db.select({ count: sql<number>`count(*) filter (where ${bookings.status} = 'completed')::int` }).from(bookings),
    db.select({ count: sql<number>`count(*)::int` }).from(practitioners).where(sql`${practitioners.active} = true`),
    db.select({ average: sql<number>`coalesce(avg(${practitionerReviews.rating}), 0)::float` }).from(practitionerReviews).where(sql`${practitionerReviews.status} = 'published'`),
  ]);

  return {
    consultationsDelivered: bookingRow?.count ?? 0,
    practitionerCount: practitionerRow?.count ?? 0,
    averageRating: Math.round((reviewRow?.average ?? 0) * 10) / 10,
  };
}

export async function getLivePractitioners(limit = 6) {
  const people = await getMarketplacePractitioners();
  return [...people]
    .sort((a, b) => Number(b.online) - Number(a.online) || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, limit);
}

export async function getFeaturedTestimonials(limit = 3) {
  return db.select({ reviewerName: practitionerReviews.reviewerName, body: practitionerReviews.body, rating: practitionerReviews.rating })
    .from(practitionerReviews)
    .where(and(sql`${practitionerReviews.status} = 'published'`, gt(sql`length(${practitionerReviews.body})`, 40)))
    .orderBy(desc(practitionerReviews.rating), desc(practitionerReviews.createdAt))
    .limit(limit);
}
