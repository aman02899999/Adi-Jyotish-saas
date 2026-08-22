import "server-only";

import { unstable_cache } from "next/cache";
import { db, withIndexFallback } from "@/lib/firestore";
import { getMarketplacePractitioners } from "@/lib/marketplace";

async function fetchHomepageStats() {
  // Demo accounts (isDemoAccount:true, seeded for internal testing only) are filtered out in JS
  // rather than via a Firestore `!=` query, which would wrongly exclude every real practitioner
  // that never has the field set at all — see getPractitionerDirectory in scheduling.ts.
  const [completedBookingsAgg, practitionersSnap, reviewsSnap] = await Promise.all([
    db.collection("bookings").where("status", "==", "completed").count().get(),
    db.collection("practitioners").select("active", "isDemoAccount").get(),
    db.collection("practitionerReviews").where("status", "==", "published").select("rating", "practitionerId").get(),
  ]);

  const demoIds = new Set(practitionersSnap.docs.filter((doc) => doc.data().isDemoAccount).map((doc) => doc.id));
  const practitionerCount = practitionersSnap.docs.filter((doc) => doc.data().active && !demoIds.has(doc.id)).length;
  const ratings = reviewsSnap.docs.filter((doc) => !demoIds.has(doc.data().practitionerId as string)).map((doc) => doc.data().rating as number);
  const average = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;

  return {
    consultationsDelivered: completedBookingsAgg.data().count,
    practitionerCount,
    averageRating: Math.round(average * 10) / 10,
  };
}

// Same trust-strip numbers for every visitor — three separate Firestore aggregations, expensive
// enough to cache. Falls back to zeros instead of crashing the page (or the credential-less
// `next build` static-generation pass) if Firestore is unreachable.
export const getHomepageStats = unstable_cache(
  async () => {
    try {
      return await fetchHomepageStats();
    } catch (error) {
      console.error("getHomepageStats: falling back to zeros —", error);
      return { consultationsDelivered: 0, practitionerCount: 0, averageRating: 0 };
    }
  },
  ["homepage-stats"],
  { tags: ["homepage-stats"], revalidate: 300 },
);

// "Online now" count changes far more often than the stats above (practitioners toggle live), so
// a much shorter TTL — still a real win over reading fresh on every single homepage request.
export const getOnlineNowCount = unstable_cache(
  async () => {
    try {
      const snap = await db.collection("practitioners").where("active", "==", true).where("online", "==", true).select("isDemoAccount").get();
      return snap.docs.filter((doc) => !doc.data().isDemoAccount).length;
    } catch (error) {
      console.error("getOnlineNowCount: falling back to 0 —", error);
      return 0;
    }
  },
  ["online-now-count"],
  { tags: ["online-now-count"], revalidate: 30 },
);

export async function getLivePractitioners(limit = 6) {
  const people = await getMarketplacePractitioners();
  return [...people]
    .sort((a, b) => Number(b.online) - Number(a.online) || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, limit);
}

export async function getSeniorAstrologers(limit = 4) {
  const people = await getMarketplacePractitioners();
  return [...people]
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.experienceYears - a.experienceYears)
    .slice(0, limit);
}

// limit is always called with the same literal (3) in practice, so a single cache key per limit
// value is fine — each distinct limit just gets its own cache entry.
export const getFeaturedTestimonials = unstable_cache(
  async (limit = 3) => {
    try {
      // Falls back to an empty list (not a page crash) if the (status, rating, createdAt)
      // composite index isn't built yet — testimonials are non-critical, unlike stats above.
      const snap = await withIndexFallback(
        () =>
          db.collection("practitionerReviews")
            .where("status", "==", "published")
            .orderBy("rating", "desc")
            .orderBy("createdAt", "desc")
            .limit(limit * 4)
            .get(),
        { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as FirebaseFirestore.QuerySnapshot,
      );
      return snap.docs
        .map((doc) => doc.data() as { reviewerName: string; body: string; rating: number })
        .filter((review) => review.body.length > 40)
        .slice(0, limit)
        .map(({ reviewerName, body, rating }) => ({ reviewerName, body, rating }));
    } catch (error) {
      console.error("getFeaturedTestimonials: falling back to empty list —", error);
      return [] as { reviewerName: string; body: string; rating: number }[];
    }
  },
  ["homepage-testimonials"],
  { tags: ["homepage-testimonials"], revalidate: 300 },
);
