import "server-only";

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
import { genuineReviews } from "@/lib/review-provenance";
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

async function fetchMarketplacePractitioners(): Promise<MarketplacePractitioner[]> {
  // Reviews fall back to empty (practitioners still list, just without ratings) if the
  // (status, createdAt) composite index isn't built yet.
  // Reviews fall back to empty (practitioners still list, just without ratings) if the
  // (status, createdAt) composite index isn't built yet. Postgres has no equivalent
  // failure mode, so the cutover branch needs no fallback wrapper.
  const [directory, publishedReviews, accuracyMap] = await Promise.all([
    getPractitionerDirectory(true),
    isSupabaseCutoverActive()
      ? getPublishedReviewsInSupabase()
      : withIndexFallback(
          () => db.collection("practitionerReviews").where("status", "==", "published").orderBy("createdAt", "desc").get(),
          { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as FirebaseFirestore.QuerySnapshot,
        ).then((snap) => snap.docs.map(reviewFromDoc)),
    getPractitionerAccuracyMap(),
  ]);
  // Ratings and review counts below set both what is displayed and what is charged (the
  // new-practitioner discount and the AI persona price bands), so synthetic reviews are removed
  // before either is computed. The Postgres query already excludes them; filtering again is free.
  const reviews = genuineReviews(publishedReviews);
  const scored = directory.map((person) => {
    const personReviews = reviews.filter((review) => review.practitionerId === person.id);
    const average = (field: "rating" | "clarity" | "empathy" | "usefulness") => personReviews.length ? personReviews.reduce((sum, review) => sum + review[field], 0) / personReviews.length : null;
    const rawRating = average("rating");
    const rating = rawRating === null ? null : Math.round(rawRating * 10) / 10;
    return {
      person,
      rating,
      reviewCount: personReviews.length,
      dimensions: personReviews.length ? { clarity: average("clarity")!, empathy: average("empathy")!, usefulness: average("usefulness")! } : null,
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
    : (await db.collection("practitionerReviews")
        .where("practitionerId", "==", practitioner.id)
        .where("status", "==", "published")
        .orderBy("createdAt", "desc")
        .get()).docs.map(reviewFromDoc));
  return { practitioner, reviews };
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
  const [completedSnap, existingSnap] = await Promise.all([
    db.collection("bookings")
      .where("clientEmail", "==", memberEmail)
      .where("practitionerId", "==", practitionerId)
      .where("status", "==", "completed")
      .orderBy("scheduledAt", "desc")
      .get(),
    db.collection("practitionerReviews").where("practitionerId", "==", practitionerId).get(),
  ]);
  const reviewed = new Set(existingSnap.docs.map((doc) => doc.data().bookingId as string));
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
