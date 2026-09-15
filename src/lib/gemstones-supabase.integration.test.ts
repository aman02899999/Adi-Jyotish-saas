import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import {
  getActiveCategories,
  getAllActiveProductSlugs,
  getProductBySlug,
  getProductCatalog,
  getProductsByIds,
  getProductsBySlugs,
  getRelatedProducts,
} from "@/lib/gemstones";

/**
 * Integration coverage for the gemstone storefront reads. Skipped unless
 * SUPABASE_DB_URL points at a reachable database carrying the migration schema,
 * and additionally needs SUPABASE_CUTOVER=true, since every assertion here is
 * about the gated Postgres path.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/gemstones-supabase.integration.test.ts
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const CAT_GEMS = "cat-gems-itest";
const CAT_RARE = "cat-rare-itest";
const P_RUBY = "prod-ruby-itest";
const P_EMERALD = "prod-emerald-itest";
const P_INACTIVE = "prod-inactive-itest";
const ALL_PRODUCTS = [P_RUBY, P_EMERALD, P_INACTIVE];
const ALL_CATEGORIES = [CAT_GEMS, CAT_RARE];

async function cleanup() {
  await query(`delete from public.gemstone_reviews where product_id = any($1::text[])`, [ALL_PRODUCTS]);
  await query(`delete from public.gemstone_product_variants where product_id = any($1::text[])`, [ALL_PRODUCTS]);
  await query(`delete from public.gemstone_product_images where product_id = any($1::text[])`, [ALL_PRODUCTS]);
  await query(`delete from public.gemstone_products where id = any($1::text[])`, [ALL_PRODUCTS]);
  await query(`delete from public.gemstone_categories where id = any($1::text[])`, [ALL_CATEGORIES]);
}

async function seed() {
  await cleanup();
  await query(
    `insert into public.gemstone_categories (id, name, slug, sort_order, active) values
       ($1, 'Gems', 'gems-itest', 1, true),
       ($2, 'Rare', 'rare-itest', 2, true)`,
    [CAT_GEMS, CAT_RARE],
  );

  const product = (id: string, name: string, slug: string, featured: boolean, active: boolean) =>
    query(
      `insert into public.gemstone_products
         (id, category_id, name, slug, short_description, description, benefits, who_should_wear,
          recommended_zodiac, recommended_planets, origin, color, treatment, certification,
          certificate_url, currency, sku, featured, trending, bestseller, active)
       values ($1, $2, $3, $4, $5, 'Full description.', 'Benefit', 'Anyone',
               'Aries, Leo', 'Sun, Mars', 'Sri Lanka', 'Red', 'None', 'GIA certified',
               null, 'INR', $6, $7, false, false, $8)`,
      [id, CAT_GEMS, name, slug, `${name} short`, `SKU-${id}`, featured, active],
    );

  const variant = (id: string, productId: string, price: number, compareAt: number | null, stock: number, active = true) =>
    query(
      `insert into public.gemstone_product_variants
         (id, product_id, label, weight_carat, weight_ratti, certification_level, price,
          compare_at_price, stock_quantity, sku, active)
       values ($1, $2, $3, '1.0', '1.1', 'GIA', $4, $5, $6, $7, $8)`,
      [id, productId, `${price} carat`, price, compareAt, stock, `VSKU-${id}`, active],
    );

  // Products first, then their children, in two separate batches. Variants,
  // images and reviews all carry a FK to gemstone_products, and a single
  // Promise.all fires them concurrently — which made this seed intermittently
  // fail with a gemstone_product_variants_product_id_fkey violation depending on
  // which pool connection landed first. Nothing about the test's assertions
  // requires the child inserts to be concurrent.
  await Promise.all([
    product(P_RUBY, "Ruby", "ruby-itest", true, true),
    product(P_EMERALD, "Emerald", "emerald-itest", false, true),
    product(P_INACTIVE, "Hidden Stone", "hidden-itest", false, false),
  ]);

  await Promise.all([
    // Ruby's storefront price is its CHEAPEST active variant: 3000, not 5000.
    // gemstone_products has no price column at all.
    variant("var-ruby-cheap", P_RUBY, 3000, 4000, 2),
    variant("var-ruby-pricey", P_RUBY, 5000, null, 3),
    variant("var-ruby-inactive", P_RUBY, 100, null, 99, false),
    variant("var-emerald", P_EMERALD, 8000, null, 0),
    variant("var-inactive", P_INACTIVE, 1000, null, 5),

    // sort_order puts the non-primary image first in the table, so a missing
    // ORDER BY would pick the wrong primary image.
    query(
      `insert into public.gemstone_product_images (id, product_id, url, alt, sort_order, is_primary) values
         ('img-ruby-1', $1, 'https://cdn.test/ruby-1.jpg', 'Ruby one', 1, false),
         ('img-ruby-2', $1, 'https://cdn.test/ruby-primary.jpg', 'Ruby primary', 2, true),
         ('img-emerald-1', $2, 'https://cdn.test/emerald-1.jpg', 'Emerald', 1, false)`,
      [P_RUBY, P_EMERALD],
    ),

    // Ruby: 5 and 4 → average 4.5 over 2. Emerald: 3 → 3.0 over 1.
    // The pending review must not count toward either.
    query(
      `insert into public.gemstone_reviews (id, product_id, reviewer_name, rating, title, body, status) values
         ('rev-ruby-1', $1, 'Asha', 5, 'Excellent', 'Very good', 'published'),
         ('rev-ruby-2', $1, 'Ravi', 4, 'Good', 'Nice', 'published'),
         ('rev-ruby-hidden', $1, 'Bot', 1, 'Spam', 'Spam', 'pending'),
         ('rev-emerald-1', $2, 'Meera', 3, 'Okay', 'Fine', 'published')`,
      [P_RUBY, P_EMERALD],
    ),
  ]);
}

describeCutover("the gemstone catalog on Postgres", () => {
  beforeAll(seed);

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("lists active products only, priced from the cheapest active variant", async () => {
    const { items, total } = await getProductCatalog({ pageSize: 48 });
    const slugs = items.map((item) => item.slug).sort();
    expect(slugs).toEqual(["emerald-itest", "ruby-itest"]);
    expect(total).toBe(2);

    const ruby = items.find((item) => item.slug === "ruby-itest");
    // Not 5000 (the other variant) and not 100 (the inactive one).
    expect(ruby?.price).toBe(3000);
    expect(typeof ruby?.price).toBe("number");
    expect(ruby?.compareAtPrice).toBe(4000);
    expect(ruby?.defaultVariantId).toBe("var-ruby-cheap");
    // 2 + 3 active stock; the inactive variant's 99 must not count.
    expect(ruby?.totalStock).toBe(5);
    expect(ruby?.inStock).toBe(true);
  });

  it("uses the primary image even when it is not the first row", async () => {
    const { items } = await getProductCatalog({ pageSize: 48 });
    const ruby = items.find((item) => item.slug === "ruby-itest");
    expect(ruby?.primaryImageUrl).toBe("https://cdn.test/ruby-primary.jpg");
  });

  it("averages only published reviews, as numbers", async () => {
    const { items } = await getProductCatalog({ pageSize: 48 });
    const ruby = items.find((item) => item.slug === "ruby-itest");
    expect(typeof ruby?.ratingAverage).toBe("number");
    expect(ruby?.ratingAverage).toBe(4.5);
    expect(ruby?.ratingCount).toBe(2);

    const emerald = items.find((item) => item.slug === "emerald-itest");
    expect(emerald?.ratingAverage).toBe(3);
    expect(emerald?.inStock).toBe(false);
  });

  it("filters by category, search and price", async () => {
    expect((await getProductCatalog({ category: "rare-itest", pageSize: 48 })).items).toHaveLength(0);
    expect((await getProductCatalog({ category: "gems-itest", pageSize: 48 })).total).toBe(2);
    expect((await getProductCatalog({ search: "ruby", pageSize: 48 })).items.map((i) => i.slug)).toEqual(["ruby-itest"]);
    // The search also matches zodiac/planet text, not just the name.
    expect((await getProductCatalog({ search: "aries", pageSize: 48 })).total).toBe(2);
    expect((await getProductCatalog({ minPrice: 5000, pageSize: 48 })).items.map((i) => i.slug)).toEqual(["emerald-itest"]);
    expect((await getProductCatalog({ maxPrice: 4000, pageSize: 48 })).items.map((i) => i.slug)).toEqual(["ruby-itest"]);
    expect((await getProductCatalog({ featured: true, pageSize: 48 })).items.map((i) => i.slug)).toEqual(["ruby-itest"]);
  });

  it("sorts by price, rating and discount", async () => {
    const asc = await getProductCatalog({ sort: "price_asc", pageSize: 48 });
    expect(asc.items.map((i) => i.slug)).toEqual(["ruby-itest", "emerald-itest"]);

    const desc = await getProductCatalog({ sort: "price_desc", pageSize: 48 });
    expect(desc.items.map((i) => i.slug)).toEqual(["emerald-itest", "ruby-itest"]);

    const byRating = await getProductCatalog({ sort: "rating", pageSize: 48 });
    expect(byRating.items.map((i) => i.slug)).toEqual(["ruby-itest", "emerald-itest"]);

    // Ruby is 25% off; Emerald has no compare-at price so no discount.
    const byDiscount = await getProductCatalog({ sort: "discount", pageSize: 48 });
    expect(byDiscount.items.map((i) => i.slug)).toEqual(["ruby-itest", "emerald-itest"]);
  });

  it("paginates against the full filtered total", async () => {
    const page1 = await getProductCatalog({ sort: "price_asc", page: 1, pageSize: 1 });
    expect(page1.items.map((i) => i.slug)).toEqual(["ruby-itest"]);
    expect(page1.total).toBe(2);
    expect(page1.pageSize).toBe(1);

    const page2 = await getProductCatalog({ sort: "price_asc", page: 2, pageSize: 1 });
    expect(page2.items.map((i) => i.slug)).toEqual(["emerald-itest"]);
  });

  it("reads a product by slug with sorted variants and images", async () => {
    const product = await getProductBySlug("ruby-itest");
    expect(product).not.toBeNull();
    expect(product?.categoryName).toBe("Gems");
    expect(product?.categorySlug).toBe("gems-itest");
    // Cheapest first.
    expect(product?.variants.map((variant) => variant.price)).toEqual([3000, 5000]);
    expect(typeof product?.variants[0]?.price).toBe("number");
    // Ordered by sort_order, so the non-primary image comes first here.
    expect(product?.images.map((image) => image.id)).toEqual(["img-ruby-1", "img-ruby-2"]);
    expect(typeof product?.images[0]?.sortOrder).toBe("number");
    expect(product?.ratingAverage).toBe(4.5);
    expect(product?.ratingCount).toBe(2);
    expect(product?.createdAt).toBeInstanceOf(Date);
  });

  it("returns null for an unknown or inactive slug", async () => {
    expect(await getProductBySlug("no-such-gem")).toBeNull();
    expect(await getProductBySlug("hidden-itest")).toBeNull();
  });

  it("lists related products excluding the one being viewed", async () => {
    const related = await getRelatedProducts(CAT_GEMS, P_RUBY, 4);
    expect(related.map((item) => item.slug)).toEqual(["emerald-itest"]);
  });

  it("returns products by id and by slug, keeping the caller's slug order", async () => {
    const byIds = await getProductsByIds([P_EMERALD, P_RUBY]);
    expect(byIds.map((item) => item.id).sort()).toEqual([P_EMERALD, P_RUBY]);

    // Requested in the opposite order of creation — the result must follow the request.
    const bySlugs = await getProductsBySlugs(["emerald-itest", "ruby-itest"]);
    expect(bySlugs.map((item) => item.slug)).toEqual(["emerald-itest", "ruby-itest"]);

    // Inactive products are dropped, and unknown slugs do not create gaps.
    const partial = await getProductsBySlugs(["ruby-itest", "hidden-itest", "no-such-gem"]);
    expect(partial.map((item) => item.slug)).toEqual(["ruby-itest"]);
  });

  it("lists active slugs for revalidation", async () => {
    const slugs = await getAllActiveProductSlugs();
    const found = slugs.filter((entry) => ["ruby-itest", "emerald-itest", "hidden-itest"].includes(entry.slug));
    expect(found.map((entry) => entry.slug).sort()).toEqual(["emerald-itest", "ruby-itest"]);
    expect(found[0]?.updatedAt).toBeInstanceOf(Date);
  });

  it("counts only active products per category", async () => {
    const categories = await getActiveCategories();
    const gems = categories.find((category) => category.slug === "gems-itest");
    const rare = categories.find((category) => category.slug === "rare-itest");
    expect(typeof gems?.productCount).toBe("number");
    expect(gems?.productCount).toBe(2);
    expect(rare?.productCount).toBe(0);
  });
});
