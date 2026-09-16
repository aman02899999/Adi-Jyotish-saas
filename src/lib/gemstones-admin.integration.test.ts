import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import {
  GemstoneError,
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  duplicateProduct,
  getCategoryBySlug,
  getProductAdminById,
  updateCategory,
  updateProduct,
} from "@/lib/gemstones";

/**
 * Integration coverage for the gemstone admin writers. Skipped unless
 * SUPABASE_DB_URL points at a reachable database carrying the migration schema,
 * and additionally needs SUPABASE_CUTOVER=true.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/gemstones-admin.integration.test.ts
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const CAT = "cat-admin-itest";
const OTHER_CAT = "cat-admin-other-itest";
const MEMBER = "member-admin-itest";
const ORDER = "order-admin-itest";
const ALL_CATEGORIES = [CAT, OTHER_CAT];

let productIds: string[] = [];

async function cleanup() {
  for (const id of productIds) {
    await query(`delete from public.gemstone_product_images where product_id = $1`, [id]);
    await query(`delete from public.gemstone_product_variants where product_id = $1`, [id]);
    await query(`delete from public.gemstone_order_items where product_id = $1`, [id]);
    await query(`delete from public.gemstone_products where id = $1`, [id]);
  }
  productIds = [];
  await query(`delete from public.gemstone_order_items where order_id = $1`, [ORDER]);
  await query(`delete from public.gemstone_orders where id = $1`, [ORDER]);
  await query(`delete from public.gemstone_categories where id = any($1::text[])`, [ALL_CATEGORIES]);
  await query(`delete from public.members where id = $1`, [MEMBER]);
}

async function seed() {
  await cleanup();
  await query(
    `insert into public.gemstone_categories (id, name, slug, description, sort_order, active)
     values ($1, 'Admin Gems', 'admin-gems-itest', 'Original description', 1, true),
            ($2, 'Other', 'admin-other-itest', '', 2, true)`,
    [CAT, OTHER_CAT],
  );
}

const variant = (sku: string, price: number, stock: number, id?: string) => ({
  id,
  label: `${price} carat`,
  weightCarat: "1.0",
  weightRatti: "1.1",
  certificationLevel: "GIA",
  price,
  compareAtPrice: null,
  stockQuantity: stock,
  sku,
  active: true,
});

const productPayload = (slug: string, sku: string) => ({
  categoryId: CAT,
  name: `Test ${slug}`,
  slug,
  shortDescription: "Short",
  description: "Long",
  benefits: "Benefits",
  whoShouldWear: "Anyone",
  recommendedZodiac: "Aries",
  recommendedPlanets: "Sun",
  origin: "Sri Lanka",
  color: "Red",
  treatment: "None",
  certification: "GIA",
  certificateUrl: "",
  sku,
  featured: false,
  trending: false,
  bestseller: false,
  active: true,
  metaTitle: "Title",
  metaDescription: "Meta",
  variants: [variant(`${sku}-v1`, 3000, 2)],
  images: [{ url: "https://cdn.test/a.jpg", alt: "A", isPrimary: true }],
});

describeCutover("gemstone category admin on Postgres", () => {
  beforeEach(seed);

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("creates a category and reads it back", async () => {
    const created = await createCategory({ name: "Brand New", description: "Hello", sortOrder: 3 });
    expect(created.id).toBeTruthy();
    expect(created.slug).toBe("brand-new");
    expect(created.sortOrder).toBe(3);
    expect(created.createdAt).toBeInstanceOf(Date);

    const fetched = await getCategoryBySlug("brand-new");
    expect(fetched?.name).toBe("Brand New");
    await query(`delete from public.gemstone_categories where id = $1`, [created.id]);
  });

  it("refuses a duplicate slug", async () => {
    // toSlug("Admin Gems") is "admin-gems", which does not collide with the
    // seeded "admin-gems-itest" — the slug has to be supplied to force one.
    await expect(createCategory({ name: "Whatever", slug: "admin-gems-itest" })).rejects.toThrow(GemstoneError);
    await expect(createCategory({ name: "Whatever", slug: "admin-gems-itest" })).rejects.toThrow(/already exists/);
  });

  it("applies a partial update without clearing other fields", async () => {
    const updated = await updateCategory(CAT, { name: "Renamed" });
    expect(updated?.name).toBe("Renamed");
    // The original description must survive a patch that did not mention it.
    expect(updated?.description).toBe("Original description");
  });

  it("refuses to rename a category onto another category's slug", async () => {
    await expect(updateCategory(CAT, { slug: "admin-other-itest" })).rejects.toThrow(/already exists/);
  });

  it("refuses to delete a category that still has products", async () => {
    const product = await createProduct(productPayload("cat-blocked", "SKU-CAT-BLOCKED"));
    productIds.push(product.id);
    await expect(deleteCategory(CAT)).rejects.toThrow(/still has products/);

    await deleteProduct(product.id);
    await expect(deleteCategory(CAT)).resolves.toBeUndefined();
  });
});

describeCutover("gemstone product admin on Postgres", () => {
  beforeEach(seed);

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("creates a product with variants and images", async () => {
    const product = await createProduct(productPayload("created-itest", "SKU-CREATED"));
    productIds.push(product.id);
    expect(product.slug).toBe("created-itest");
    expect(product.currency).toBe("INR");
    // gemstone_products has no price column: the storefront price is the cheapest
    // ACTIVE variant, which the reads path computes. The admin form only writes
    // variants, so a saved product must not gain a stale price field of its own.
    expect("price" in product).toBe(false);

    const detail = await getProductAdminById(product.id);
    expect(detail?.variants).toHaveLength(1);
    expect(detail?.variants[0]?.price).toBe(3000);
    expect(typeof detail?.variants[0]?.price).toBe("number");
    expect(detail?.images).toHaveLength(1);
    expect(detail?.images[0]?.isPrimary).toBe(true);
  });

  it("refuses a duplicate slug, and requires a SKU and variants", async () => {
    const product = await createProduct(productPayload("dupe-itest", "SKU-DUPE"));
    productIds.push(product.id);
    await expect(createProduct(productPayload("dupe-itest", "SKU-DUPE-2"))).rejects.toThrow(/already exists/);
    await expect(createProduct({ ...productPayload("no-sku", ""), sku: "" })).rejects.toThrow(/SKU is required/);
    // Must throw before any product row exists, not after one is orphaned.
    await expect(createProduct({ ...productPayload("no-variants", "SKU-NV"), variants: [] })).rejects.toThrow(/at least one/);
    const { rows: orphans } = await query(`select id from public.gemstone_products where slug = $1`, ["no-variants"]);
    expect(orphans).toHaveLength(0);
  });

  it("applies a partial update and keeps untouched fields", async () => {
    const product = await createProduct(productPayload("patch-me", "SKU-PATCH"));
    productIds.push(product.id);

    const { product: updated } = await updateProduct(product.id, { name: "Renamed Stone" });
    expect(updated.name).toBe("Renamed Stone");
    expect(updated.description).toBe("Long");
    expect(updated.origin).toBe("Sri Lanka");
  });

  it("reports priceDropped and backInStock for wishlist notifications", async () => {
    const product = await createProduct(productPayload("signals", "SKU-SIG"));
    productIds.push(product.id);
    const existing = (await getProductAdminById(product.id))!.variants[0]!;

    // Price falls and stock goes from 2 to 5 — only the price drop is newsworthy.
    const priceOnly = await updateProduct(product.id, {
      variants: [variant(existing.sku, 2000, 5, existing.id)],
    });
    expect(priceOnly.wishlistTrigger).toEqual({ priceDropped: true, backInStock: false });

    // Price rises back; stock drops to zero then returns, which is the restock case.
    await updateProduct(product.id, { variants: [variant(existing.sku, 2500, 0, existing.id)] });
    const restock = await updateProduct(product.id, {
      variants: [variant(existing.sku, 2500, 4, existing.id)],
    });
    expect(restock.wishlistTrigger).toEqual({ priceDropped: false, backInStock: true });
  });

  it("drops variants that are no longer submitted", async () => {
    const product = await createProduct({
      ...productPayload("drop-variant", "SKU-DROPV"),
      variants: [variant("SKU-DROPV-1", 1000, 1), variant("SKU-DROPV-2", 2000, 1)],
    });
    productIds.push(product.id);
    expect((await getProductAdminById(product.id))?.variants).toHaveLength(2);

    const kept = (await getProductAdminById(product.id))!.variants[0]!;
    await updateProduct(product.id, { variants: [variant(kept.sku, kept.price, kept.stockQuantity, kept.id)] });
    const after = await getProductAdminById(product.id);
    expect(after?.variants).toHaveLength(1);
    expect(after?.variants[0]?.id).toBe(kept.id);
  });

  it("enforces one primary image per product, which Firestore never did", async () => {
    const product = await createProduct(productPayload("two-primary", "SKU-2PRIM"));
    productIds.push(product.id);
    // The partial unique index gemstone_product_images_one_primary rejects this.
    // Saving such a product used to succeed and silently keep both.
    await expect(
      updateProduct(product.id, {
        images: [
          { url: "https://cdn.test/1.jpg", alt: "one", isPrimary: true },
          { url: "https://cdn.test/2.jpg", alt: "two", isPrimary: true },
        ],
      }),
    ).rejects.toThrow();
  });

  it("refuses to delete a product referenced by an order", async () => {
    const product = await createProduct(productPayload("ordered", "SKU-ORDERED"));
    productIds.push(product.id);
    const variantId = (await getProductAdminById(product.id))!.variants[0]!.id;

    await query(`insert into public.members (id, name, email) values ($1, 'Buyer', 'buyer-admin-itest@example.test')`, [MEMBER]);
    await query(
      `insert into public.gemstone_orders (id, order_number, member_id, status, total)
       values ($1, 'ORD-ADMIN-ITEST', $2, 'paid', 3000)`,
      [ORDER, MEMBER],
    );
    await query(
      `insert into public.gemstone_order_items (id, order_id, product_id, variant_id)
       values ('item-admin-itest', $1, $2, $3)`,
      [ORDER, product.id, variantId],
    );

    await expect(deleteProduct(product.id)).rejects.toThrow(/existing orders/);
  });

  it("duplicates a product into an inactive copy with zero stock", async () => {
    const product = await createProduct(productPayload("to-copy", "SKU-COPY"));
    productIds.push(product.id);

    const copy = await duplicateProduct(product.id);
    productIds.push(copy.id);
    expect(copy.name).toBe("Test to-copy (Copy)");
    expect(copy.active).toBe(false);
    expect(copy.sku.startsWith("SKU-COPY-COPY-")).toBe(true);

    const detail = await getProductAdminById(copy.id);
    expect(detail?.variants).toHaveLength(1);
    expect(detail?.variants[0]?.stockQuantity).toBe(0);
    expect(detail?.images).toHaveLength(1);
  });

  it("deletes a product and its variants and images", async () => {
    const product = await createProduct(productPayload("to-delete", "SKU-DEL"));
    productIds.push(product.id);
    await deleteProduct(product.id);
    expect(await getProductAdminById(product.id)).toBeNull();
  });
});
