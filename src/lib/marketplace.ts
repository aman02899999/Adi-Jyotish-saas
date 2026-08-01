import "server-only";

import { db, withIndexFallback } from "@/lib/firestore";
import { getPractitionerDirectory } from "@/lib/scheduling";

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
};

export async function getMarketplacePractitioners(): Promise<MarketplacePractitioner[]> {
  // Reviews fall back to empty (practitioners still list, just without ratings) if the
  // (status, createdAt) composite index isn't built yet.
  const [directory, reviewsSnap] = await Promise.all([
    getPractitionerDirectory(true),
    withIndexFallback(
      () => db.collection("practitionerReviews").where("status", "==", "published").orderBy("createdAt", "desc").get(),
      { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as FirebaseFirestore.QuerySnapshot,
    ),
  ]);
  const reviews = reviewsSnap.docs.map(reviewFromDoc);
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
