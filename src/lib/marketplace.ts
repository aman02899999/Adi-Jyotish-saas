import "server-only";

import { unstable_cache } from "next/cache";
import { AggregateField, FieldValue } from "firebase-admin/firestore";
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

type ReviewScore = { practitionerId: string; count: number; rating: number; clarity: number; empathy: number; usefulness: number };
type AccuracyEntry = [string, { accuracyPercent: number; resolvedCount: number }];

const SCORE_SUMS = {
  count: AggregateField.count(),
  rating: AggregateField.sum("rating"),
  clarity: AggregateField.sum("clarity"),
  empathy: AggregateField.sum("empathy"),
  usefulness: AggregateField.sum("usefulness"),
};

/**
 * Genuine review totals per practitioner, from aggregation queries rather than review documents.
 * Firestore bills an aggregation about one read per thousand entries, where fetching the reviews
 * cost one read each, and the table still holds thousands of synthetic ones. Genuine totals are all
 * published reviews minus the synthetic ones: genuine reviews written before provenance existed
 * carry no `source`, so they cannot be selected directly (see review-provenance.ts).
 */
async function firestoreReviewScores(practitionerIds: string[]): Promise<ReviewScore[]> {
  const reviews = db.collection("practitionerReviews");
  const scores = await Promise.all(practitionerIds.map(async (practitionerId) => {
    const published = reviews.where("practitionerId", "==", practitionerId).where("status", "==", "published");
    const [all, synthetic] = await Promise.all([
      published.aggregate(SCORE_SUMS).get(),
      published.where("source", "==", SYNTHETIC_REVIEW_SOURCE).aggregate(SCORE_SUMS).get(),
    ]);
    const total = all.data();
    const fake = synthetic.data();
    const genuine = (field: "rating" | "clarity" | "empathy" | "usefulness") => (total[field] ?? 0) - (fake[field] ?? 0);
    return { practitionerId, count: total.count - fake.count, rating: genuine("rating"), clarity: genuine("clarity"), empathy: genuine("empathy"), usefulness: genuine("usefulness") };
  }));
  return scores.filter((score) => score.count > 0);
}

/** Per-practitioner genuine review sums and prediction accuracy: the expensive part of the marketplace. */
async function fetchReviewScores(): Promise<{ scores: ReviewScore[]; accuracy: AccuracyEntry[] }> {
  const accuracy = getPractitionerAccuracyMap();
  if (!isSupabaseCutoverActive()) {
    const directory = await getPractitionerDirectory(true);
    return { scores: await firestoreReviewScores(directory.map((person) => person.id)), accuracy: [...(await accuracy).entries()] };
  }
  // The Postgres query already excludes synthetic reviews; filtering again is free.
  const sums = new Map<string, ReviewScore>();
  for (const review of genuineReviews(await getPublishedReviewsInSupabase())) {
    const score = sums.get(review.practitionerId) ?? { practitionerId: review.practitionerId, count: 0, rating: 0, clarity: 0, empathy: 0, usefulness: 0 };
    score.count += 1;
    score.rating += review.rating;
    score.clarity += review.clarity;
    score.empathy += review.empathy;
    score.usefulness += review.usefulness;
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
  const [directory, { scores, accuracy }] = await Promise.all([getPractitionerDirectory(true), getReviewScores()]);
  const scoreById = new Map(scores.map((score) => [score.practitionerId, score]));
  const accuracyMap = new Map(accuracy);
  const scored = directory.map((person) => {
    const score = scoreById.get(person.id);
    const average = (field: "rating" | "clarity" | "empathy" | "usefulness") => score ? score[field] / score.count : null;
    const rawRating = average("rating");
    const rating = rawRating === null ? null : Math.round(rawRating * 10) / 10;
    return {
      person,
      rating,
      reviewCount: score?.count ?? 0,
      dimensions: score ? { clarity: average("clarity")!, empathy: average("empathy")!, usefulness: average("usefulness")! } : null,
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

// The full directory + every published review + prediction accuracy, joined and scored — expensive
// enough (and identical for every visitor) that reading it fresh on every request/page is wasteful.
// Cached at runtime with a short TTL; falls back to an empty list instead of crashing the page (or
// the build — nothing here runs at build time without Firebase credentials to read with anyway).
export const getMarketplacePractitioners = unstable_cache(
  async () => {
    try {
      return await fetchMarketplacePractitioners();
    } catch (error) {
      console.error("getMarketplacePractitioners: falling back to empty list —", error);
      return [] as MarketplacePractitioner[];
    }
  },
  ["marketplace-practitioners"],
  { tags: ["marketplace-practitioners"], revalidate: 120 },
);

export async function getMarketplacePractitioner(slug: string) {
  const people = await getMarketplacePractitioners();
  const practitioner = people.find((person) => person.slug === slug);
  if (!practitioner) return null;
  const reviews = genuineReviews(isSupabaseCutoverActive()
    ? await getPublishedReviewsForPractitionerInSupabase(practitioner.id)
    : await genuineReviewsForProfile(practitioner.id, practitioner.reviewCount));
  return { practitioner, reviews };
}

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
