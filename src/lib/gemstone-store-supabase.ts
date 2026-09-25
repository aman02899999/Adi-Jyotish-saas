import "server-only";

import { randomUUID } from "node:crypto";

import { query } from "@/lib/postgres";

/**
 * Postgres twins for the gemstone store's reviews, wishlist, recommendations and the admin
 * product list. The catalogue itself (gemstones-supabase.ts), its admin CRUD
 * (gemstones-admin-supabase.ts), orders and coupons were ported earlier.
 */

/* --------------------------------- reviews --------------------------------- */

export type GemstoneReviewRow = {
  id: string; productId: string; memberId: string | null; orderId: string | null; reviewerName: string;
  rating: number; title: string; body: string; imageUrls: string; status: string; helpfulVotes: number;
  createdAt: Date; updatedAt: Date;
};

const REVIEW_COLUMNS = `r.id, r.product_id, r.member_id, r.order_id, r.reviewer_name, r.rating, r.title, r.body,
  r.image_urls, r.status, r.helpful_votes, r.created_at, r.updated_at`;

type RawReview = {
  id: string; product_id: string; member_id: string | null; order_id: string | null; reviewer_name: string; rating: number;
  title: string; body: string; image_urls: string; status: string; helpful_votes: number; created_at: Date; updated_at: Date;
};

function reviewFromRow(row: RawReview): GemstoneReviewRow {
  return {
    id: row.id, productId: row.product_id, memberId: row.member_id, orderId: row.order_id, reviewerName: row.reviewer_name,
    rating: Number(row.rating), title: row.title, body: row.body, imageUrls: row.image_urls, status: row.status,
    helpfulVotes: Number(row.helpful_votes), createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
  };
}

export async function getPublishedGemstoneReviewsInSupabase(productId: string): Promise<GemstoneReviewRow[]> {
  const { rows } = await query<RawReview>(
    `select ${REVIEW_COLUMNS} from public.gemstone_reviews r where r.product_id = $1 and r.status = 'published' order by r.created_at desc`,
    [productId],
  );
  return rows.map(reviewFromRow);
}

export async function listGemstoneReviewsForAdminInSupabase(status?: string): Promise<Array<GemstoneReviewRow & { productName: string }>> {
  const filtered = status && status !== "all";
  const { rows } = await query<RawReview & { product_name: string | null }>(
    `select ${REVIEW_COLUMNS}, p.name as product_name
       from public.gemstone_reviews r left join public.gemstone_products p on p.id = r.product_id
      ${filtered ? "where r.status = $1" : ""}
      order by r.created_at desc`,
    filtered ? [status] : [],
  );
  return rows.map((row) => ({ ...reviewFromRow(row), productName: row.product_name ?? "Deleted product" }));
}

/** True only when the member's own paid order contains this product. */
export async function isVerifiedGemstonePurchaseInSupabase(memberId: string, orderId: string, productId: string): Promise<boolean> {
  const { rows } = await query(
    `select 1 from public.gemstone_orders o join public.gemstone_order_items i on i.order_id = o.id
      where o.id = $1 and o.member_id = $2 and o.payment_status = 'paid' and i.product_id = $3 limit 1`,
    [orderId, memberId, productId],
  );
  return rows.length > 0;
}

/**
 * A verified-purchase review is keyed `${orderId}_${productId}`, so one paid order earns one
 * verified review per product; null means that review already exists.
 */
export async function insertGemstoneReviewInSupabase(review: {
  productId: string; memberId: string | null; orderId: string | null; reviewerName: string;
  rating: number; title: string; body: string; imageUrls: string;
}): Promise<GemstoneReviewRow | null> {
  const id = review.orderId ? `${review.orderId}_${review.productId}` : randomUUID();
  const { rows } = await query<RawReview>(
    `insert into public.gemstone_reviews as r (id, product_id, member_id, order_id, reviewer_name, rating, title, body, image_urls, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     on conflict (id) do nothing
     returning ${REVIEW_COLUMNS}`,
    [id, review.productId, review.memberId, review.orderId, review.reviewerName, review.rating, review.title, review.body, review.imageUrls],
  );
  return rows[0] ? reviewFromRow(rows[0]) : null;
}

export async function setGemstoneReviewStatusInSupabase(id: string, status: "published" | "hidden"): Promise<GemstoneReviewRow | null> {
  const { rows } = await query<RawReview>(
    `update public.gemstone_reviews as r set status = $2, updated_at = now() where r.id = $1 returning ${REVIEW_COLUMNS}`,
    [id, status],
  );
  return rows[0] ? reviewFromRow(rows[0]) : null;
}

export async function deleteGemstoneReviewInSupabase(id: string): Promise<void> {
  await query(`delete from public.gemstone_reviews where id = $1`, [id]);
}

/** One increment per call, atomically, so concurrent votes all count. */
export async function incrementGemstoneReviewHelpfulInSupabase(id: string): Promise<GemstoneReviewRow | null> {
  const { rows } = await query<RawReview>(
    `update public.gemstone_reviews as r set helpful_votes = r.helpful_votes + 1 where r.id = $1 returning ${REVIEW_COLUMNS}`,
    [id],
  );
  return rows[0] ? reviewFromRow(rows[0]) : null;
}

/* --------------------------------- wishlist -------------------------------- */

export async function getWishlistProductIdsInSupabase(memberId: string): Promise<string[]> {
  const { rows } = await query<{ product_id: string }>(
    `select product_id from public.gemstone_wishlist where member_id = $1 order by created_at desc`,
    [memberId],
  );
  return rows.map((row) => row.product_id);
}

/** Removes the entry if present, otherwise adds it. The id matches the copy's `${member}_${product}`. */
export async function toggleWishlistInSupabase(memberId: string, productId: string): Promise<{ added: boolean }> {
  const removed = await query(`delete from public.gemstone_wishlist where member_id = $1 and product_id = $2`, [memberId, productId]);
  if ((removed.rowCount ?? 0) > 0) return { added: false };
  await query(
    `insert into public.gemstone_wishlist (id, member_id, product_id) values ($1, $2, $3) on conflict (member_id, product_id) do nothing`,
    [`${memberId}_${productId}`, memberId, productId],
  );
  return { added: true };
}

export async function getMembersWishlistingInSupabase(productId: string): Promise<Array<{ memberId: string; email: string | null; name: string | null }>> {
  const { rows } = await query<{ member_id: string; email: string | null; name: string | null }>(
    `select w.member_id, m.email::text as email, m.name
       from public.gemstone_wishlist w join public.members m on m.id = w.member_id
      where w.product_id = $1`,
    [productId],
  );
  return rows.map((row) => ({ memberId: row.member_id, email: row.email, name: row.name }));
}

/* ----------------------------- recommendations ----------------------------- */

export async function getRecommendedPlanetsInSupabase(productIds: string[]): Promise<Map<string, string>> {
  if (!productIds.length) return new Map();
  const { rows } = await query<{ id: string; recommended_planets: string | null }>(
    `select id, recommended_planets from public.gemstone_products where id = any($1)`,
    [productIds],
  );
  return new Map(rows.map((row) => [row.id, row.recommended_planets ?? ""]));
}

export async function insertGemstoneRecommendationInSupabase(input: {
  memberId: string | null; name: string; birthDate: string; concern: string | null; zodiacSign: string; categorySlugs: string; narrative: string;
}): Promise<{ id: string; createdAt: Date }> {
  const id = randomUUID();
  const { rows } = await query<{ created_at: Date }>(
    `insert into public.gemstone_recommendations (id, member_id, name, birth_date, concern, zodiac_sign, category_slugs, narrative)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning created_at`,
    [id, input.memberId, input.name, input.birthDate, input.concern, input.zodiacSign, input.categorySlugs, input.narrative],
  );
  return { id, createdAt: new Date(rows[0].created_at) };
}

/* ---------------------------- admin product list --------------------------- */

/** Each product's category name, total stock, variant count and lowest price, newest first. */
export async function getProductAdminSummariesInSupabase(): Promise<Array<{ id: string; categoryName: string; totalStock: number; variantCount: number; startingPrice: number }>> {
  const { rows } = await query<{ id: string; category_name: string | null; total_stock: number; variant_count: number; starting_price: string | null }>(
    `select p.id, c.name as category_name,
            coalesce(sum(v.stock_quantity), 0)::int as total_stock,
            count(v.id)::int as variant_count,
            min(v.price) as starting_price
       from public.gemstone_products p
       left join public.gemstone_categories c on c.id = p.category_id
       left join public.gemstone_product_variants v on v.product_id = p.id
      group by p.id, c.name, p.created_at
      order by p.created_at desc`,
  );
  return rows.map((row) => ({
    id: row.id,
    categoryName: row.category_name ?? "Uncategorized",
    totalStock: row.total_stock,
    variantCount: row.variant_count,
    startingPrice: row.starting_price === null ? 0 : Number(row.starting_price),
  }));
}
