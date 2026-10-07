import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { db, withIndexFallback } from "@/lib/firestore";
import {
  getAllReviewsInSupabase,
  getPractitionerNameMapInSupabase,
  getPublishedReviewsForPractitionerInSupabase,
  getPublishedReviewsInSupabase,
} from "@/lib/practitioners-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { getPractitionerDirectory } from "@/lib/scheduling";
import { getPractitionerAccuracyMap } from "@/lib/predictions";
import { computeSessionPriceAnchor, computeTieredSessionPrices, reviewDiscountPercent } from "@/lib/practitioner-pricing";
import { applyDiscount } from "@/lib/subscriptions";
import { genuineReviews, MEMBER_REVIEW_SOURCE, SYNTHETIC_REVIEW_SOURCE } from "@/lib/review-provenance";
import { listFavoritePractitionerIdsInSupabase } from "@/lib/member-favorites-supabase";
import { getUnreviewedCompletedBookingsInSupabase } from "@/lib/bookings-supabase";

export type PractitionerReview = {
  id: string;
  practitionerId: string;
  memberId: string | null;
  bookingId: string;
  reviewerName: string;
  rating: number;
  clarity: number;
  empathy: number;
  usefulness: number;
  body: string;
  status: string;
  /** "seed" for synthetic reviews (see review-provenance.ts), "member" or absent for genuine ones. */
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function reviewFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): PractitionerReview {
  const data = doc.data();
  return {
    id: doc.id,
    practitionerId: data.practitionerId,
    memberId: data.memberId ?? null,
    bookingId: data.bookingId,
    reviewerName: data.reviewerName,
    rating: data.rating,
    clarity: data.clarity,
    empathy: data.empathy,
    usefulness: data.usefulness,
    body: data.body,
    status: data.status,
    source: (data.source as string | undefined) ?? null,
    createdAt: (data.createdAt as FirebaseFirestore.Timestamp)?.toDate() ?? new Date(),
    updatedAt: (data.updatedAt as FirebaseFirestore.Timestamp)?.toDate() ?? new Date(),
  };
}

export type MarketplacePractitioner = Awaited<ReturnType<typeof getPractitionerDirectory>>[number] & {
  rating: number | null;
  reviewCount: number;
  dimensions: { clarity: number; empathy: number; usefulness: number } | null;
  predictionAccuracy: { accuracyPercent: number; resolvedCount: number } | null;
  reviewDiscountPercent: number;
  discountedRatePerMinute: number;
  /** Flat instant-chat price for AI-powered practitioners (see isAiPowered); null for the real
   * practitioners, who still charge per-minute via discountedRatePerMinute above. */
  sessionPrice: number | null;
  /** Display-only "worth ₹X" anchor and the 50-80% discount off it that sessionPrice represents
   * (see computeSessionPriceAnchor) — null wherever sessionPrice is null. Doesn't affect billing. */
  sessionOriginalPrice: number | null;
  sessionDiscountPercent: number | null;
};

/** Genuine review totals for one practitioner. The dimension sums are only known on the Postgres
 * path; on Firestore the profile page derives them from the reviews it lists. */
type ReviewScore = { practitionerId: string; count: number; rating: number; dimensions?: { clarity: number; empathy: number; usefulness: number } };
function averageDimensions(sums: { clarity: number; empathy: number; usefulness: number }, count: number) {
  return { clarity: sums.clarity / count, empathy: sums.empathy / count, usefulness: sums.usefulness / count };
}

type AccuracyEntry = [string, { accuracyPercent: number; resolvedCount: number }];

const STARS = [1, 2, 3, 4, 5] as const;

/** How many reviews the query matches at each star rating, one count aggregation per star. */
async function countsByStar(query: FirebaseFirestore.Query): Promise<number[]> {
  return Promise.all(STARS.map(async (stars) => (await query.where("rating", "==", stars).count().get()).data().count));
}

/**
 * Per-star counts of each practitioner's synthetic reviews. Synthetic reviews can no longer be
 * created, so these only change when an admin purges them, and the purge expires this tag.
 */
const getSyntheticStarCounts = unstable_cache(
  async (practitionerIds: string[]) => Promise.all(practitionerIds.map(async (practitionerId) => [
    practitionerId,
    await countsByStar(db.collection("practitionerReviews").where("practitionerId", "==", practitionerId).where("status", "==", "published").where("source", "==", SYNTHETIC_REVIEW_SOURCE)),
  ] as const)),
  ["marketplace-synthetic-star-counts"],
  { tags: ["marketplace-review-scores"], revalidate: 86_400 },
);

/**
 * Genuine review totals per practitioner from count aggregations, not review documents. A count is
 * billed about one read per thousand matches, where fetching the reviews cost one read each, and
 * the table still holds thousands of synthetic ones. Ratings are whole stars (the review route
 * accepts only integers 1-5), so counting per star gives the exact sum. Counts with equality
 * filters run on Firestore's automatic indexes; a sum aggregation would need a composite index.
 * Genuine reviews from before provenance existed carry no `source`, so genuine totals are all
 * published reviews minus the synthetic ones rather than a selection of genuine ones.
 */
async function firestoreReviewScores(practitionerIds: string[]): Promise<ReviewScore[]> {
  const [totals, synthetic] = await Promise.all([
    Promise.all(practitionerIds.map((practitionerId) => countsByStar(db.collection("practitionerReviews").where("practitionerId", "==", practitionerId).where("status", "==", "published")))),
    getSyntheticStarCounts(practitionerIds).then((rows) => new Map(rows)),
  ]);
  return practitionerIds
    .map((practitionerId, index) => {
      const fake = synthetic.get(practitionerId) ?? [0, 0, 0, 0, 0];
      const genuine = totals[index].map((count, star) => Math.max(0, count - fake[star]));
      return {
        practitionerId,
        count: genuine.reduce((sum, count) => sum + count, 0),
        rating: genuine.reduce((sum, count, star) => sum + count * STARS[star], 0),
      };
    })
    .filter((score) => score.count > 0);
}

/**
 * The active, non-demo practitioners with their schedules. Reading it costs about 270 Firestore
 * reads (see expirePractitionerDirectoryCaches), so it is cached for an hour and expired by every
 * change to a practitioner.
 */
const getPublicDirectory = unstable_cache(() => getPractitionerDirectory(true), ["public-practitioner-directory"], { tags: ["practitioner-directory"], revalidate: 3600 });

/** Per-practitioner genuine review sums and prediction accuracy: the expensive part of the marketplace. */
async function fetchReviewScores(): Promise<{ scores: ReviewScore[]; accuracy: AccuracyEntry[] }> {
  const accuracy = getPractitionerAccuracyMap();
  if (!isSupabaseCutoverActive()) {
    const directory = await getPublicDirectory();
    return { scores: await firestoreReviewScores(directory.map((person) => person.id)), accuracy: [...(await accuracy).entries()] };
  }
  // The Postgres query already excludes synthetic reviews; filtering again is free.
  const sums = new Map<string, ReviewScore>();
  for (const review of genuineReviews(await getPublishedReviewsInSupabase())) {
    const score = sums.get(review.practitionerId) ?? { practitionerId: review.practitionerId, count: 0, rating: 0, dimensions: { clarity: 0, empathy: 0, usefulness: 0 } };
    score.count += 1;
    score.rating += review.rating;
    score.dimensions!.clarity += review.clarity;
    score.dimensions!.empathy += review.empathy;
    score.dimensions!.usefulness += review.usefulness;
    sums.set(review.practitionerId, score);
  }
  return { scores: [...sums.values()], accuracy: [...(await accuracy).entries()] };
}

// Reading every published review is what made the marketplace expensive: the old seeder left
// thousands of synthetic rows, and every refresh re-read all of them, which emptied the free daily
// Firestore quota within hours. Scores change only when a review does, and moderation expires this
// tag at once (expireReviewDerivedCaches), so an hour costs nothing in freshness. Who is online
// still refreshes on the marketplace's own short TTL below.
export const getReviewScores = unstable_cache(fetchReviewScores, ["marketplace-review-scores"], { tags: ["marketplace-review-scores"], revalidate: 3600 });

async function fetchMarketplacePractitioners(): Promise<MarketplacePractitioner[]> {
  const [directory, { scores, accuracy }] = await Promise.all([getPublicDirectory(), getReviewScores()]);
  const scoreById = new Map(scores.map((score) => [score.practitionerId, score]));
  const accuracyMap = new Map(accuracy);
  const scored = directory.map((person) => {
    const score = scoreById.get(person.id);
    const rawRating = score ? score.rating / score.count : null;
    const rating = rawRating === null ? null : Math.round(rawRating * 10) / 10;
    return {
      person,
      rating,
      reviewCount: score?.count ?? 0,
      dimensions: score?.dimensions ? averageDimensions(score.dimensions, score.count) : null,
    };
  });
  // One batch computation across every AI-powered practitioner (see computeTieredSessionPrices) —
  // the requested pricing split ("60% of the roster between ₹49-149, …") is a statement about the
  // whole cohort, not something derivable per-practitioner in isolation.
  const sessionPriceById = computeTieredSessionPrices(
    scored.filter((entry) => entry.person.isAiPowered).map((entry) => ({ id: entry.person.id, rating: entry.rating, reviewCount: entry.reviewCount })),
  );
  return scored.map(({ person, rating, reviewCount, dimensions }) => {
    const discountPercent = reviewDiscountPercent(reviewCount);
    const sessionPrice = sessionPriceById.get(person.id) ?? null;
    const sessionAnchor = sessionPrice !== null ? computeSessionPriceAnchor(sessionPrice, person.slug) : null;
    return {
      ...person,
      rating,
      reviewCount,
      dimensions,
      predictionAccuracy: accuracyMap.get(person.id) ?? null,
      reviewDiscountPercent: discountPercent,
      discountedRatePerMinute: Math.max(1, applyDiscount(person.chatRatePerMinute, discountPercent)),
      sessionPrice,
      sessionOriginalPrice: sessionAnchor?.originalPrice ?? null,
      sessionDiscountPercent: sessionAnchor?.discountPercent ?? null,
    } satisfies MarketplacePractitioner;
  });
}

// The directory, review scores and prediction accuracy, joined and scored, identical for every
// visitor. A refresh reads only the caches beneath it, so the short TTL costs no Firestore reads
// until one of those expires.
const getCachedMarketplacePractitioners = unstable_cache(fetchMarketplacePractitioners, ["marketplace-practitioners"], { tags: ["marketplace-practitioners"], revalidate: 120 });

// Falls back to an empty list instead of crashing the page (or the build, which has no Firebase
// credentials). The fallback is outside the cache on purpose: when a refresh fails (the free
// Firestore quota running out, say), the cache keeps serving the last list it built instead of
// storing the empty one, so the astrologers stay listed through the outage.
export async function getMarketplacePractitioners(): Promise<MarketplacePractitioner[]> {
  try {
    return await getCachedMarketplacePractitioners();
  } catch (error) {
    console.error("getMarketplacePractitioners: falling back to empty list —", error);
    return [];
  }
}

// Per request: a profile page asks twice, once for its metadata and once to render.
export const getMarketplacePractitioner = cache(async (slug: string) => {
  const people = await getMarketplacePractitioners();
  const practitioner = people.find((person) => person.slug === slug);
  if (!practitioner) return null;
  const reviews = genuineReviews(isSupabaseCutoverActive()
    ? await getPublishedReviewsForPractitionerInSupabase(practitioner.id)
    : await genuineReviewsForProfile(practitioner.id, practitioner.reviewCount));
  // On Firestore the cached scores carry star counts only, so the clarity, empathy and usefulness
  // bars come from the reviews this page lists.
  if (!practitioner.dimensions && reviews.length) {
    const sums = reviews.reduce((total, review) => ({ clarity: total.clarity + review.clarity, empathy: total.empathy + review.empathy, usefulness: total.usefulness + review.usefulness }), { clarity: 0, empathy: 0, usefulness: 0 });
    return { practitioner: { ...practitioner, dimensions: averageDimensions(sums, reviews.length) }, reviews };
  }
  return { practitioner, reviews };
});

/**
 * The genuine reviews listed on a profile page. This used to read every published review of the
 * practitioner on each view, up to a thousand synthetic ones for a featured astrologer, with no
 * cache. Member-written reviews are stamped `source: "member"` and can be fetched on their own, at
 * most PROFILE_REVIEWS of them. Genuine reviews from before provenance existed carry no source and
 * cannot be selected directly, so only when the cached genuine count says some exist does this
 * fall back to reading the practitioner's published reviews.
 */
const PROFILE_REVIEWS = 50;
async function genuineReviewsForProfile(practitionerId: string, genuineCount: number): Promise<PractitionerReview[]> {
  const published = db.collection("practitionerReviews").where("practitionerId", "==", practitionerId).where("status", "==", "published");
  // Equality filters only, so no composite index is needed; the newest-first order is applied here.
  const member = (await published.where("source", "==", MEMBER_REVIEW_SOURCE).limit(PROFILE_REVIEWS).get()).docs.map(reviewFromDoc);
  if (member.length >= Math.min(genuineCount, PROFILE_REVIEWS)) return member.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return (await published.orderBy("createdAt", "desc").get()).docs.map(reviewFromDoc);
}

/** Favorites are stored as members/{memberId}/favorites/{practitionerId} — doc existence IS the
 * membership check, so add/remove/list are all simple, no separate unique-index needed. */
export async function getFavoritePractitionerIds(memberId: string) {
  if (isSupabaseCutoverActive()) return listFavoritePractitionerIdsInSupabase(memberId);
  const snap = await db.collection("members").doc(memberId).collection("favorites").get();
  return snap.docs.map((doc) => doc.id);
}

export async function getEligibleReviewBookings(memberEmail: string, practitionerId: string) {
  if (isSupabaseCutoverActive()) return getUnreviewedCompletedBookingsInSupabase(memberEmail, practitionerId);
  const completedSnap = await db.collection("bookings")
    .where("clientEmail", "==", memberEmail)
    .where("practitionerId", "==", practitionerId)
    .where("status", "==", "completed")
    .orderBy("scheduledAt", "desc")
    .get();
  // Almost every profile view comes from a member with no completed consultation here, and the
  // practitioner's reviews can run to a thousand documents, so they are read only when needed,
  // and then only the ones for these bookings.
  if (completedSnap.empty) return [];
  const bookingIds = completedSnap.docs.map((doc) => doc.id);
  const reviewed = new Set<string>();
  for (let index = 0; index < bookingIds.length; index += 30) {
    const existingSnap = await db.collection("practitionerReviews").where("bookingId", "in", bookingIds.slice(index, index + 30)).select("bookingId").get();
    for (const doc of existingSnap.docs) reviewed.add(doc.data().bookingId as string);
  }
  return completedSnap.docs
    .filter((doc) => !reviewed.has(doc.id))
    .map((doc) => {
      const data = doc.data() as { serviceTitle: string; scheduledAt: FirebaseFirestore.Timestamp };
      return { id: doc.id, serviceTitle: data.serviceTitle, scheduledAt: data.scheduledAt.toDate() };
    });
}

export async function getAdminReviews() {
  const reviews = isSupabaseCutoverActive()
    ? await getAllReviewsInSupabase()
    : (await db.collection("practitionerReviews").orderBy("createdAt", "desc").get()).docs.map(reviewFromDoc);
  const practitionerIds = [...new Set(reviews.map((review) => review.practitionerId))];
  const practitionerById = isSupabaseCutoverActive()
    // One `= any(...)` query instead of a doc read per distinct practitioner.
    ? await getPractitionerNameMapInSupabase(practitionerIds)
    : new Map(
        (await Promise.all(practitionerIds.map((id) => db.collection("practitioners").doc(id).get())))
          .filter((doc) => doc.exists)
          .map((doc) => [doc.id, doc.data() as { name: string; slug: string }]),
      );
  return reviews.map((review) => {
    const practitioner = practitionerById.get(review.practitionerId);
    return { ...review, practitionerName: practitioner?.name ?? "Unknown", practitionerSlug: practitioner?.slug ?? "" };
  });
}
