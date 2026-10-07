import "server-only";

import { unstable_cache } from "next/cache";
import { db, withIndexFallback } from "@/lib/firestore";
import { getMarketplacePractitioners, getReviewScores } from "@/lib/marketplace";
import { isSyntheticReview, MEMBER_REVIEW_SOURCE } from "@/lib/review-provenance";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { getFeaturedTestimonialsInSupabase, getHomepageStatsInSupabase } from "@/lib/cms-supabase";

async function fetchHomepageStats() {
  if (isSupabaseCutoverActive()) return getHomepageStatsInSupabase();
  // Demo accounts (isDemoAccount:true, seeded for internal testing only) are filtered out in JS
  // rather than via a Firestore `!=` query, which would wrongly exclude every real practitioner
  // that never has the field set at all — see getPractitionerDirectory in scheduling.ts.
  // Review totals come from the marketplace's cached aggregation (getReviewScores), not from
  // reading every review document: the table still holds thousands of synthetic reviews, and
  // scanning them each hour helped empty the free daily Firestore quota.
  const [completedBookingsAgg, practitionersSnap, { scores }] = await Promise.all([
    db.collection("bookings").where("status", "==", "completed").count().get(),
    db.collection("practitioners").select("active", "isDemoAccount").get(),
    getReviewScores(),
  ]);

  const demoIds = new Set(practitionersSnap.docs.filter((doc) => doc.data().isDemoAccount).map((doc) => doc.id));
  const practitionerCount = practitionersSnap.docs.filter((doc) => doc.data().active && !demoIds.has(doc.id)).length;
  // Scores already exclude synthetic reviews; demo accounts are left out here, because this is the
  // site-wide rating a visitor weighs the whole service by.
  const genuine = scores.filter((score) => !demoIds.has(score.practitionerId));
  const reviewCount = genuine.reduce((sum, score) => sum + score.count, 0);
  const average = reviewCount ? genuine.reduce((sum, score) => sum + score.rating, 0) / reviewCount : 0;

  return {
    consultationsDelivered: completedBookingsAgg.data().count,
    practitionerCount,
    averageRating: Math.round(average * 10) / 10,
    // Kept separate from consultationsDelivered: the homepage's AggregateRating structured data
    // used to report the consultation count as its reviewCount, which tells search engines a
    // number of reviews that does not exist.
    reviewCount,
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
      return { consultationsDelivered: 0, practitionerCount: 0, averageRating: 0, reviewCount: 0 };
    }
  },
  ["homepage-stats"],
  { tags: ["homepage-stats"], revalidate: 3600 },
);

// Counted from the marketplace list, which already holds the active, non-demo practitioners and
// is expired the moment one goes online or offline. This used to read every online practitioner
// every 30 seconds: up to about 98,000 reads a day, nearly twice the free Firestore quota.
export async function getOnlineNowCount(): Promise<number> {
  return (await getMarketplacePractitioners()).filter((person) => person.online).length;
}

export async function getLivePractitioners(limit = 6) {
  const people = await getMarketplacePractitioners();
  return [...people]
    .sort((a, b) => Number(b.online) - Number(a.online) || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, limit);
}

export async function getSeniorAstrologers(limit = 4) {
  const people = await getMarketplacePractitioners();
  // "Our most senior astrologers — decades of wisdom" is a claim about people's experience, and
  // an AI persona has none; its experienceYears is a seeded number. Humans only.
  return people
    .filter((person) => !person.isAiPowered)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.experienceYears - a.experienceYears)
    .slice(0, limit);
}

// limit is always called with the same literal (3) in practice, so a single cache key per limit
// value is fine — each distinct limit just gets its own cache entry.
export const getFeaturedTestimonials = unstable_cache(
  async (limit = 3) => {
    type Testimonial = { reviewerName: string; body: string; rating: number };
    // Only the fields a testimonial and its cursor need are read, so a page is cheap. The scan is bounded at
    // 1,000 documents per cache refresh (hourly at most): enough to reach past a few
    // hundred synthetic reviews, while a table that is still mostly synthetic cannot turn one
    // homepage render into an unbounded read. Past the bound it shows no testimonial rather than a
    // synthetic one, and the admin reviews screen flags the rows to delete.
    const PAGE_SIZE = Math.max(limit * 4, 50);
    const MAX_PAGES = 20;
    try {
      if (isSupabaseCutoverActive()) return await getFeaturedTestimonialsInSupabase(limit);
      // Member-written reviews are stamped and can be fetched on their own. Only when the cached
      // genuine count says older, unstamped genuine reviews exist is the bounded scan below needed.
      const published = db.collection("practitionerReviews").where("status", "==", "published");
      const [{ scores }, memberCount] = await Promise.all([
        getReviewScores(),
        published.where("source", "==", MEMBER_REVIEW_SOURCE).count().get().then((snap) => snap.data().count),
      ]);
      const genuineCount = scores.reduce((sum, score) => sum + score.count, 0);
      if (memberCount >= genuineCount) {
        const snap = await published.where("source", "==", MEMBER_REVIEW_SOURCE).limit(PAGE_SIZE).get();
        return snap.docs
          .map((doc) => doc.data() as Testimonial & { createdAt?: FirebaseFirestore.Timestamp })
          .filter((review) => review.body.length > 40)
          .sort((a, b) => b.rating - a.rating || (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
          .slice(0, limit)
          .map(({ reviewerName, body, rating }) => ({ reviewerName, body, rating }));
      }
      // Pages until it has enough genuine testimonials. A single top-N query is not enough while
      // synthetic reviews are still in the table: they are overwhelmingly 5-star, so the highest
      // rated dozen can all be synthetic and filtering them would leave the homepage with nothing
      // even though genuine 5-star reviews exist further down.
      const found: Testimonial[] = [];
      let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      for (let page = 0; page < MAX_PAGES && found.length < limit; page += 1) {
        const after = cursor;
        // Falls back to an empty page (not a page crash) if the (status, rating, createdAt)
        // composite index isn't built yet — testimonials are non-critical, unlike stats above.
        const snap: FirebaseFirestore.QuerySnapshot = await withIndexFallback(
          () => {
            let query = db.collection("practitionerReviews")
              .where("status", "==", "published")
              .orderBy("rating", "desc")
              .orderBy("createdAt", "desc")
              // status/rating/createdAt are not displayed but must stay in the projection:
              // startAfter() builds its cursor from the snapshot's where/orderBy fields and throws
              // if any is missing, which the catch below would turn into an empty homepage.
              .select("reviewerName", "body", "rating", "source", "status", "createdAt")
              .limit(PAGE_SIZE);
            if (after) query = query.startAfter(after);
            return query.get();
          },
          { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as FirebaseFirestore.QuerySnapshot,
        );
        for (const doc of snap.docs) {
          const review = doc.data() as Testimonial & { source?: string | null };
          // A testimonial quoted on the homepage is presented as something a real client said.
          if (isSyntheticReview(review) || review.body.length <= 40) continue;
          found.push({ reviewerName: review.reviewerName, body: review.body, rating: review.rating });
          if (found.length === limit) break;
        }
        if (snap.docs.length < PAGE_SIZE) break;
        cursor = snap.docs[snap.docs.length - 1];
      }
      return found;
    } catch (error) {
      console.error("getFeaturedTestimonials: falling back to empty list —", error);
      return [] as Testimonial[];
    }
  },
  ["homepage-testimonials"],
  { tags: ["homepage-testimonials"], revalidate: 3600 },
);
