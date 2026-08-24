import "server-only";

import { unstable_cache } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { db, withIndexFallback } from "@/lib/firestore";
import { getPractitionerDirectory } from "@/lib/scheduling";
import { getPractitionerAccuracyMap } from "@/lib/predictions";
import { computeFixedSessionPrice, reviewDiscountPercent } from "@/lib/practitioner-pricing";
import { applyDiscount } from "@/lib/subscriptions";
import { sendEmail, genericNotificationEmailHtml } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { getSiteUrl } from "@/lib/site-url";

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
};

async function fetchMarketplacePractitioners(): Promise<MarketplacePractitioner[]> {
  // Reviews fall back to empty (practitioners still list, just without ratings) if the
  // (status, createdAt) composite index isn't built yet.
  const [directory, reviewsSnap, accuracyMap] = await Promise.all([
    getPractitionerDirectory(true),
    withIndexFallback(
      () => db.collection("practitionerReviews").where("status", "==", "published").orderBy("createdAt", "desc").get(),
      { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as FirebaseFirestore.QuerySnapshot,
    ),
    getPractitionerAccuracyMap(),
  ]);
  const reviews = reviewsSnap.docs.map(reviewFromDoc);
  return directory.map((person) => {
    const personReviews = reviews.filter((review) => review.practitionerId === person.id);
    const average = (field: "rating" | "clarity" | "empathy" | "usefulness") => personReviews.length ? personReviews.reduce((sum, review) => sum + review[field], 0) / personReviews.length : null;
    const rating = average("rating");
    const discountPercent = reviewDiscountPercent(personReviews.length);
    return {
      ...person,
      rating: rating === null ? null : Math.round(rating * 10) / 10,
      reviewCount: personReviews.length,
      dimensions: personReviews.length ? { clarity: average("clarity")!, empathy: average("empathy")!, usefulness: average("usefulness")! } : null,
      predictionAccuracy: accuracyMap.get(person.id) ?? null,
      reviewDiscountPercent: discountPercent,
      discountedRatePerMinute: Math.max(1, applyDiscount(person.chatRatePerMinute, discountPercent)),
      sessionPrice: person.isAiPowered
        ? computeFixedSessionPrice({ experienceYears: person.experienceYears, verificationLevel: person.verificationLevel, featured: person.featured, rating, reviewCount: personReviews.length })
        : null,
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
  const snap = await db.collection("practitionerReviews")
    .where("practitionerId", "==", practitioner.id)
    .where("status", "==", "published")
    .orderBy("createdAt", "desc")
    .get();
  return { practitioner, reviews: snap.docs.map(reviewFromDoc) };
}

/** Favorites are stored as members/{memberId}/favorites/{practitionerId} — doc existence IS the
 * membership check, so add/remove/list are all simple, no separate unique-index needed. */
export async function getFavoritePractitionerIds(memberId: string) {
  const snap = await db.collection("members").doc(memberId).collection("favorites").get();
  return snap.docs.map((doc) => doc.id);
}

export async function getEligibleReviewBookings(memberEmail: string, practitionerId: string) {
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

/** Scheduled sweep (called from the housekeeping cron): emails a review request for every
 * completed booking whose session finished 2-26 hours ago, once — a member who never comes back
 * to the site to be asked in person will otherwise never leave a review. The 2-hour floor gives
 * an admin/practitioner time to actually mark the booking "completed"; the 26-hour ceiling keeps
 * this sweep, which runs every 15 minutes, from re-scanning bookings indefinitely. reviewRequestedAt
 * is stamped either way (review already exists, or the request was just sent) so a booking is only
 * ever considered once. */
export async function sendPendingReviewRequests() {
  const now = Date.now();
  const windowStart = new Date(now - 26 * 60 * 60 * 1000);
  const windowEnd = new Date(now - 2 * 60 * 60 * 1000);
  const snap = await withIndexFallback(
    () => db.collection("bookings")
      .where("status", "==", "completed")
      .where("scheduledAt", ">=", windowStart)
      .where("scheduledAt", "<=", windowEnd)
      .get(),
    { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as FirebaseFirestore.QuerySnapshot,
  );

  let sent = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as {
      reviewRequestedAt?: unknown;
      practitionerId?: string | null;
      practitionerName?: string | null;
      clientEmail?: string;
      clientName?: string;
      serviceTitle?: string;
    };
    if (data.reviewRequestedAt || !data.practitionerId || !data.clientEmail) continue;

    const reviewSnap = await db.collection("practitionerReviews").where("bookingId", "==", doc.id).limit(1).get();
    if (!reviewSnap.empty) {
      await doc.ref.update({ reviewRequestedAt: FieldValue.serverTimestamp() });
      continue;
    }

    const practitionerSnap = await db.collection("practitioners").doc(data.practitionerId).get();
    const slug = (practitionerSnap.data() as { slug?: string } | undefined)?.slug;
    const reviewUrl = (slug ? new URL(`/astrologers/${slug}`, getSiteUrl()) : new URL("/dashboard/consultations", getSiteUrl())).toString();
    const practitionerLabel = data.practitionerName ?? "your astrologer";

    await sendEmail({
      to: data.clientEmail,
      subject: `How was your reading with ${practitionerLabel}?`,
      html: genericNotificationEmailHtml({
        title: "Share your experience",
        name: data.clientName ?? "there",
        body: `Your ${data.serviceTitle ?? "reading"} with ${practitionerLabel} is complete. A quick review helps other members find the right guide.`,
        ctaLabel: "Leave a review",
        ctaUrl: reviewUrl,
      }),
    }).catch((error) => console.error("Review request email failed", error));

    const memberSnap = await db.collection("members").where("email", "==", data.clientEmail).limit(1).get();
    if (!memberSnap.empty) {
      await createNotification({
        recipientType: "member",
        recipientId: memberSnap.docs[0].id,
        type: "review_request",
        title: "How was your reading?",
        body: `Leave a review for your session with ${practitionerLabel}.`,
        link: slug ? `/astrologers/${slug}` : "/dashboard/consultations",
      }).catch((error) => console.error("Review request notification failed", error));
    }

    await doc.ref.update({ reviewRequestedAt: FieldValue.serverTimestamp() });
    sent++;
  }
  return { checked: snap.docs.length, sent };
}

export async function getAdminReviews() {
  const reviewsSnap = await db.collection("practitionerReviews").orderBy("createdAt", "desc").get();
  const reviews = reviewsSnap.docs.map(reviewFromDoc);
  const practitionerIds = [...new Set(reviews.map((review) => review.practitionerId))];
  const practitionerDocs = await Promise.all(practitionerIds.map((id) => db.collection("practitioners").doc(id).get()));
  const practitionerById = new Map(practitionerDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data() as { name: string; slug: string }]));
  return reviews.map((review) => {
    const practitioner = practitionerById.get(review.practitionerId);
    return { ...review, practitionerName: practitioner?.name ?? "Unknown", practitionerSlug: practitioner?.slug ?? "" };
  });
}
