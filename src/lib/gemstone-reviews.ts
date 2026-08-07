import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { notifyAdmins } from "@/lib/notifications";

export class ReviewError extends Error {}

const reviewsCol = db.collection("gemstoneReviews");
const ordersCol = db.collection("gemstoneOrders");

export type GemstoneReview = {
  id: string;
  productId: string;
  memberId: string | null;
  orderId: string | null;
  reviewerName: string;
  rating: number;
  title: string;
  body: string;
  imageUrls: string;
  status: string;
  helpfulVotes: number;
  createdAt: Date;
  updatedAt: Date;
};

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function fromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): GemstoneReview {
  const data = doc.data() as Omit<GemstoneReview, "id" | "createdAt" | "updatedAt"> & { createdAt?: Timestamp; updatedAt?: Timestamp };
  return { ...data, id: doc.id, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
}

export async function getPublishedReviews(productId: string): Promise<GemstoneReview[]> {
  // Requires a composite index: gemstoneReviews (productId ASC, status ASC, createdAt DESC) — see firestore.indexes.json.
  const snap = await reviewsCol.where("productId", "==", productId).where("status", "==", "published").orderBy("createdAt", "desc").get();
  return snap.docs.map(fromDoc);
}

export async function getAllReviewsAdmin(status?: string) {
  const snap = await reviewsCol.orderBy("createdAt", "desc").get();
  const reviews = snap.docs.map(fromDoc);
  const filtered = status && status !== "all" ? reviews.filter((review) => review.status === status) : reviews;
  if (!filtered.length) return [];

  const productIds = [...new Set(filtered.map((review) => review.productId))];
  const productSnaps = productIds.length ? await db.getAll(...productIds.map((id) => db.collection("gemstoneProducts").doc(id))) : [];
  const productNameById = new Map(productSnaps.map((snap) => [snap.id, (snap.data()?.name as string | undefined) ?? "Deleted product"]));

  return filtered.map((review) => ({ ...review, productName: productNameById.get(review.productId) ?? "Deleted product" }));
}

export async function createReview({ productId, memberId, orderId, reviewerName, rating, title, body, imageUrls }: {
  productId: string;
  memberId: string | null;
  orderId?: string | null;
  reviewerName: string;
  rating: number;
  title?: string;
  body: string;
  imageUrls?: string;
}) {
  const clampedRating = Math.min(5, Math.max(1, Math.round(rating)));
  if (!reviewerName.trim()) throw new ReviewError("Your name is required.");
  if (!body.trim() || body.trim().length < 8) throw new ReviewError("Please write a fuller review (at least a sentence).");

  let verifiedOrderId: string | null = null;
  if (memberId && orderId) {
    const orderSnap = await ordersCol.doc(orderId).get();
    const order = orderSnap.data() as { memberId?: string | null; paymentStatus?: string } | undefined;
    if (orderSnap.exists && order?.memberId === memberId && order.paymentStatus === "paid") {
      const itemMatch = await ordersCol.doc(orderId).collection("items").where("productId", "==", productId).limit(1).get();
      if (!itemMatch.empty) verifiedOrderId = orderId;
    }
  }

  const reviewData = {
    productId,
    memberId,
    orderId: verifiedOrderId,
    reviewerName: reviewerName.trim().slice(0, 120),
    rating: clampedRating,
    title: title?.trim().slice(0, 160) ?? "",
    body: body.trim().slice(0, 3000),
    imageUrls: imageUrls?.trim() ?? "",
    status: "pending",
    helpfulVotes: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  let ref: FirebaseFirestore.DocumentReference;
  if (verifiedOrderId) {
    // Doc id = orderId_productId for verified-purchase reviews, so create() enforces one review
    // per order/product pair — otherwise the same paid order could be resubmitted indefinitely,
    // each copy still earning the "verified purchase" badge. Anonymous/unverified reviews have no
    // such natural key to dedupe against; they rely on the existing rate limit + moderation queue
    // (status stays "pending" until an admin publishes it) instead.
    ref = reviewsCol.doc(`${verifiedOrderId}_${productId}`);
    try {
      await ref.create(reviewData);
    } catch {
      throw new ReviewError("You've already reviewed this product for this order.");
    }
  } else {
    ref = reviewsCol.doc();
    await ref.set(reviewData);
  }
  const created = fromDoc(await ref.get());

  const adminIds = await getAdminIdsWithPermission("gemstones");
  await notifyAdmins(adminIds, {
    type: "gemstone_review.pending",
    title: "New review awaiting moderation",
    body: `${created.reviewerName} rated a product ${created.rating}/5.`,
    link: "/admin/gemstones/reviews",
  }).catch(() => {});

  return created;
}

export async function moderateReview(id: string, status: "published" | "hidden") {
  const ref = reviewsCol.doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ReviewError("Review not found.");
  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
  return fromDoc(await ref.get());
}

export async function deleteReview(id: string) {
  await reviewsCol.doc(id).delete();
}

export async function markReviewHelpful(id: string) {
  const ref = reviewsCol.doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ReviewError("Review not found.");
  await ref.update({ helpfulVotes: FieldValue.increment(1) });
  return fromDoc(await ref.get());
}
