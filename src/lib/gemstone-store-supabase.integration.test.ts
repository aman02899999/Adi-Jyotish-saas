import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * The rest of the gemstone store on Postgres: reviews, wishlist, recommendations and the admin
 * product list. The review functions reached Firestore through a module-level handle the cutover
 * guard could not see; the others were listed. After cutover, reviews, wishlists and the admin
 * product and review lists would all have stayed on Firestore while the catalogue and its admin
 * edits moved. Needs a migrated database and SUPABASE_CUTOVER=true.
 */
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
const sent = vi.hoisted(() => ({ notifications: [] as string[], emails: [] as string[] }));
vi.mock("@/lib/notifications", () => ({
  createNotification: async ({ recipientId }: { recipientId: string }) => { sent.notifications.push(recipientId); },
  notifyAdmins: async () => {},
}));
vi.mock("@/lib/email", () => ({
  sendEmail: async ({ to }: { to: string }) => { sent.emails.push(to); },
  genericNotificationEmailHtml: () => "<p></p>",
}));
vi.mock("@/lib/admin-roles", () => ({ getAdminIdsWithPermission: async () => [] }));

const reviews = await import("@/lib/gemstone-reviews");
const wishlist = await import("@/lib/gemstone-wishlist");
const { getAllProductsAdmin } = await import("@/lib/gemstones");
const { createGemstoneRecommendation } = await import("@/lib/gemstone-recommendations");

const P = "gstore_itest_";
const PRODUCT = `${P}product`;
const MEMBER = `${P}member`;
const OTHER = `${P}other`;
const PAID = `${P}paid`;
const UNPAID = `${P}unpaid`;

async function cleanup() {
  await query(`delete from public.gemstone_reviews where product_id like 'gstore\\_itest\\_%'`);
  await query(`delete from public.gemstone_wishlist where member_id like 'gstore\\_itest\\_%'`);
  await query(`delete from public.gemstone_order_items where order_id like 'gstore\\_itest\\_%'`);
  await query(`delete from public.gemstone_orders where id like 'gstore\\_itest\\_%'`);
  await query(`delete from public.gemstone_products where id like 'gstore\\_itest\\_%'`);
  await query(`delete from public.gemstone_categories where id like 'gstore\\_itest\\_%'`);
  await query(`delete from public.gemstone_recommendations where member_id like 'gstore\\_itest\\_%'`);
  await query(`delete from public.members where id like 'gstore\\_itest\\_%'`);
}

async function seed() {
  await cleanup();
  sent.notifications.length = 0;
  sent.emails.length = 0;
  await query(`insert into public.gemstone_categories (id, name, slug) values ('${P}cat', 'Itest Sapphires', '${P}cat')`);
  await query(`insert into public.gemstone_products (id, name, slug, category_id, created_at) values ($1, 'Itest Blue Sapphire', $1, '${P}cat', now() + interval '1 day')`, [PRODUCT]);
  await query(
    `insert into public.gemstone_product_variants (id, product_id, price, stock_quantity, active) values
       ('${P}v1', $1, 45000, 2, true), ('${P}v2', $1, 32000.5, 3, false)`,
    [PRODUCT],
  );
  for (const id of [MEMBER, OTHER]) await query(`insert into public.members (id, name, email) values ($1, 'Asha', $2)`, [id, `${id}@example.test`]);
  for (const [id, status] of [[PAID, "paid"], [UNPAID, "pending"]]) {
    await query(`insert into public.gemstone_orders (id, order_number, member_id, payment_status) values ($1, $1, $2, $3)`, [id, MEMBER, status]);
    await query(`insert into public.gemstone_order_items (id, order_id, product_id, variant_id) values ($1, $2, $3, '${P}v1')`, [`${id}_item`, id, PRODUCT]);
  }
}

const review = (overrides: Partial<Parameters<typeof reviews.createReview>[0]> = {}) =>
  reviews.createReview({ productId: PRODUCT, memberId: MEMBER, reviewerName: "Asha", rating: 5, body: "Beautiful stone, exactly as described.", ...overrides });

describeCutover("the gemstone store on Postgres", () => {
  beforeEach(seed);
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  describe("reviews", () => {
    it("holds a new review for moderation, and publishes it when an admin does", async () => {
      const created = await review({ memberId: null, rating: 9 });
      expect(created).toMatchObject({ status: "pending", rating: 5, orderId: null });
      expect(await reviews.getPublishedReviews(PRODUCT)).toEqual([]);

      await reviews.moderateReview(created.id, "published");
      expect((await reviews.getPublishedReviews(PRODUCT)).map((r) => r.id)).toEqual([created.id]);
      await expect(reviews.moderateReview(`${P}missing`, "hidden")).rejects.toThrow("not found");
    });

    it("marks a review verified only for the member's own paid order, once per order", async () => {
      const verified = await review({ orderId: PAID });
      expect(verified).toMatchObject({ id: `${PAID}_${PRODUCT}`, orderId: PAID });
      await expect(review({ orderId: PAID })).rejects.toThrow("already reviewed");

      expect((await review({ orderId: UNPAID })).orderId).toBeNull();
      expect((await review({ memberId: OTHER, orderId: PAID })).orderId).toBeNull();
    });

    it("lists every review for the admin with its product's name, filtered by status", async () => {
      const pending = await review();
      const published = await review();
      await reviews.moderateReview(published.id, "published");

      const all = (await reviews.getAllReviewsAdmin()).filter((r) => r.productId === PRODUCT);
      expect(all.map((r) => r.productName)).toEqual(["Itest Blue Sapphire", "Itest Blue Sapphire"]);
      const onlyPending = (await reviews.getAllReviewsAdmin("pending")).filter((r) => r.productId === PRODUCT);
      expect(onlyPending.map((r) => r.id)).toEqual([pending.id]);
    });

    it("counts every helpful vote, even at the same moment, and deletes a review", async () => {
      const created = await review();
      await Promise.all(Array.from({ length: 10 }, () => reviews.markReviewHelpful(created.id)));
      const { rows } = await query<{ helpful_votes: number }>(`select helpful_votes from public.gemstone_reviews where id = $1`, [created.id]);
      expect(rows[0].helpful_votes).toBe(10);

      await reviews.deleteReview(created.id);
      await expect(reviews.markReviewHelpful(created.id)).rejects.toThrow("not found");
    });
  });

  describe("wishlist", () => {
    it("adds and removes a product", async () => {
      expect(await wishlist.toggleWishlist(MEMBER, PRODUCT)).toEqual({ added: true });
      expect(await wishlist.getWishlistProductIds(MEMBER)).toEqual([PRODUCT]);
      expect(await wishlist.toggleWishlist(MEMBER, PRODUCT)).toEqual({ added: false });
      expect(await wishlist.getWishlistProductIds(MEMBER)).toEqual([]);
    });

    it("tells everyone who saved a product when its price drops", async () => {
      await wishlist.toggleWishlist(MEMBER, PRODUCT);
      await wishlist.toggleWishlist(OTHER, PRODUCT);
      const result = await wishlist.notifyWishlistedMembers(PRODUCT, "Itest Blue Sapphire", PRODUCT, { priceDropped: true, backInStock: false });

      expect(result).toEqual({ notified: 2 });
      expect(sent.notifications.sort()).toEqual([MEMBER, OTHER].sort());
      expect(sent.emails.sort()).toEqual([`${MEMBER}@example.test`, `${OTHER}@example.test`].sort());
    });
  });

  it("saves a member's gemstone recommendation from their real Moon sign", async () => {
    const { recommendation, sign } = await createGemstoneRecommendation({
      memberId: MEMBER, name: "Asha", birthDate: "1992-03-14", birthTime: "08:30", birthPlace: "Jaipur, India", concern: "career",
    });
    const { rows } = await query(`select member_id, zodiac_sign, concern, narrative from public.gemstone_recommendations where id = $1`, [recommendation.id]);
    expect(rows[0]).toMatchObject({ member_id: MEMBER, zodiac_sign: sign.key, concern: "career", narrative: recommendation.narrative });
  });

  it("lists products for the admin with category, stock across variants and lowest price", async () => {
    const listed = (await getAllProductsAdmin()).find((product) => product.id === PRODUCT);
    expect(listed).toMatchObject({ name: "Itest Blue Sapphire", categoryName: "Itest Sapphires", totalStock: 5, variantCount: 2, startingPrice: 32000.5 });
    // Newest first: this product is created a day ahead of everything else.
    expect((await getAllProductsAdmin())[0].id).toBe(PRODUCT);
  });
});
