import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gemstoneOrderItems, gemstoneOrders, gemstoneProducts, gemstoneReviews, type GemstoneReview } from "@/db/schema";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { notifyAdmins } from "@/lib/notifications";

export class ReviewError extends Error {}

export async function getPublishedReviews(productId: number): Promise<GemstoneReview[]> {
  return db.select().from(gemstoneReviews).where(and(eq(gemstoneReviews.productId, productId), eq(gemstoneReviews.status, "published"))).orderBy(desc(gemstoneReviews.createdAt));
}

export async function getAllReviewsAdmin(status?: string) {
  const rows = await db.select({ review: gemstoneReviews, productName: gemstoneProducts.name })
    .from(gemstoneReviews)
    .innerJoin(gemstoneProducts, eq(gemstoneReviews.productId, gemstoneProducts.id))
    .orderBy(desc(gemstoneReviews.createdAt));
  const filtered = status && status !== "all" ? rows.filter((row) => row.review.status === status) : rows;
  return filtered.map((row) => ({ ...row.review, productName: row.productName }));
}

export async function createReview({ productId, memberId, orderId, reviewerName, rating, title, body, imageUrls }: {
  productId: number;
  memberId: number | null;
  orderId?: number | null;
  reviewerName: string;
  rating: number;
  title?: string;
  body: string;
  imageUrls?: string;
}) {
  const clampedRating = Math.min(5, Math.max(1, Math.round(rating)));
  if (!reviewerName.trim()) throw new ReviewError("Your name is required.");
  if (!body.trim() || body.trim().length < 8) throw new ReviewError("Please write a fuller review (at least a sentence).");

  let verifiedOrderId: number | null = null;
  if (memberId && orderId) {
    const [match] = await db.select({ id: gemstoneOrders.id })
      .from(gemstoneOrders)
      .innerJoin(gemstoneOrderItems, eq(gemstoneOrderItems.orderId, gemstoneOrders.id))
      .where(and(eq(gemstoneOrders.id, orderId), eq(gemstoneOrders.memberId, memberId), eq(gemstoneOrderItems.productId, productId), eq(gemstoneOrders.paymentStatus, "paid")))
      .limit(1);
    if (match) verifiedOrderId = match.id;
  }

  const [created] = await db.insert(gemstoneReviews).values({
    productId,
    memberId,
    orderId: verifiedOrderId,
    reviewerName: reviewerName.trim().slice(0, 120),
    rating: clampedRating,
    title: title?.trim().slice(0, 160) ?? "",
    body: body.trim().slice(0, 3000),
    imageUrls: imageUrls?.trim() ?? "",
    status: "pending",
  }).returning();

  const adminIds = await getAdminIdsWithPermission("gemstones");
  await notifyAdmins(adminIds, {
    type: "gemstone_review.pending",
    title: "New review awaiting moderation",
    body: `${created.reviewerName} rated a product ${created.rating}/5.`,
    link: "/admin/gemstones/reviews",
  }).catch(() => {});

  return created;
}

export async function moderateReview(id: number, status: "published" | "hidden") {
  const [updated] = await db.update(gemstoneReviews).set({ status, updatedAt: new Date() }).where(eq(gemstoneReviews.id, id)).returning();
  if (!updated) throw new ReviewError("Review not found.");
  return updated;
}

export async function deleteReview(id: number) {
  await db.delete(gemstoneReviews).where(eq(gemstoneReviews.id, id));
}

export async function markReviewHelpful(id: number) {
  const [updated] = await db.update(gemstoneReviews).set({ helpfulVotes: sql`${gemstoneReviews.helpfulVotes} + 1` }).where(eq(gemstoneReviews.id, id)).returning();
  if (!updated) throw new ReviewError("Review not found.");
  return updated;
}
