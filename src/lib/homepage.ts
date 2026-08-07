import "server-only";

import { db, withIndexFallback } from "@/lib/firestore";
import { getMarketplacePractitioners } from "@/lib/marketplace";

export async function getHomepageStats() {
  const [completedBookingsAgg, activePractitionersAgg, reviewsSnap] = await Promise.all([
    db.collection("bookings").where("status", "==", "completed").count().get(),
    db.collection("practitioners").where("active", "==", true).count().get(),
    db.collection("practitionerReviews").where("status", "==", "published").select("rating").get(),
  ]);

  const ratings = reviewsSnap.docs.map((doc) => doc.data().rating as number);
  const average = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;

  return {
    consultationsDelivered: completedBookingsAgg.data().count,
    practitionerCount: activePractitionersAgg.data().count,
    averageRating: Math.round(average * 10) / 10,
  };
}

export async function getOnlineNowCount() {
  const agg = await db.collection("practitioners").where("active", "==", true).where("online", "==", true).count().get();
  return agg.data().count;
}

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

export async function getFeaturedTestimonials(limit = 3) {
  // Falls back to an empty list (not a page crash) if the (status, rating, createdAt) composite
  // index isn't built yet — testimonials are non-critical, unlike the directory/stats above.
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
}
