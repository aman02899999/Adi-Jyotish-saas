import "server-only";

import { randomUUID } from "node:crypto";

import { query, queryModels, withTransaction } from "@/lib/postgres";
import type { CategoryRow, ImageRow, ProductRow, VariantRow } from "@/lib/gemstones-supabase";

/**
 * Postgres data access for the gemstone admin writers.
 *
 * Kept in a separate module from gemstones-supabase.ts because the concerns
 * differ: that one is read-only and shaped for the storefront, this one writes
 * and has to deal with the constraints the schema enforces but Firestore never
 * did.
 *
 * Three of those constraints change observable behaviour at cutover, and each is
 * handled deliberately rather than discovered later:
 *
 *  1. gemstone_categories.slug and gemstone_products.slug are UNIQUE. The app
 *     pre-checks and throws a friendly GemstoneError; that check races, so the
 *     unique violation is caught too and reported the same way.
 *  2. gemstone_product_images has a PARTIAL unique index enforcing at most one
 *     primary image per product. Firestore allowed several, and
 *     decorateProducts picked the first it found. Saving a product that has two
 *     primary images therefore now fails where it used to succeed — which is the
 *     point, but it is a change.
 *  3. gemstone_order_items.product_id is deliberately NOT a foreign key, so
 *     "is this product referenced by an order" is an explicit count, not a
 *     constraint that would block the delete on its own.
 */

const CATEGORY_COLUMNS = `id, name, slug, description, image_url, sort_order, active, created_at, updated_at`;

type CategorySqlRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string | null;
  sort_order: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

function categoryFromSqlRow(row: CategorySqlRow): CategoryRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type ProductSqlRow = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  benefits: string;
  who_should_wear: string;
  recommended_zodiac: string;
  recommended_planets: string;
  origin: string;
  color: string;
  treatment: string;
  certification: string;
  certificate_url: string;
  currency: string;
  sku: string;
  featured: boolean;
  trending: boolean;
  bestseller: boolean;
  active: boolean;
  meta_title: string;
  meta_description: string;
  created_at: Date;
  updated_at: Date;
};

function productFromSqlRow(row: ProductSqlRow): ProductRow {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description,
    description: row.description,
    benefits: row.benefits,
    whoShouldWear: row.who_should_wear,
    recommendedZodiac: row.recommended_zodiac,
    recommendedPlanets: row.recommended_planets,
    origin: row.origin,
    color: row.color,
    treatment: row.treatment,
    certification: row.certification,
    certificateUrl: row.certificate_url,
    currency: row.currency,
    sku: row.sku,
    featured: row.featured,
    trending: row.trending,
    bestseller: row.bestseller,
    active: row.active,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PRODUCT_RETURNING = `
  returning id, category_id, name, slug, short_description, description, benefits,
            who_should_wear, recommended_zodiac, recommended_planets, origin, color,
            treatment, certification, certificate_url, currency, sku, featured,
            trending, bestseller, active, meta_title, meta_description,
            created_at, updated_at`;

/* ---------------------------------- categories ---------------------------------- */

export async function categorySlugTakenInSupabase(slug: string, excludeId?: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `select id from public.gemstone_categories where slug = $1 and ($2::text is null or id <> $2) limit 1`,
    [slug, excludeId ?? null],
  );
  return result.rows.length > 0;
}

export async function insertCategoryInSupabase(input: {
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
}): Promise<CategoryRow> {
  const result = await query<CategorySqlRow>(
    `insert into public.gemstone_categories (id, name, slug, description, image_url, sort_order, active)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ${CATEGORY_COLUMNS}`,
    [randomUUID(), input.name, input.slug, input.description, input.imageUrl, input.sortOrder, input.active],
  );
  return categoryFromSqlRow(result.rows[0] as CategorySqlRow);
}

export async function updateCategoryInSupabase(
  id: string,
  patch: Partial<{ name: string; slug: string; description: string; imageUrl: string | null; sortOrder: number; active: boolean }>,
): Promise<CategoryRow | null> {
  // coalesce keeps absent fields at their current value; a null imageUrl is a
  // real change, so it is passed through explicitly rather than coalesced.
  const result = await query<CategorySqlRow>(
    `update public.gemstone_categories
        set name = coalesce($2, name),
            slug = coalesce($3, slug),
            description = coalesce($4, description),
            image_url = case when $8 then $5 else image_url end,
            sort_order = coalesce($6, sort_order),
            active = coalesce($7, active),
            updated_at = now()
      where id = $1
      returning ${CATEGORY_COLUMNS}`,
    [
      id,
      patch.name ?? null,
      patch.slug ?? null,
      patch.description ?? null,
      patch.imageUrl ?? null,
      patch.sortOrder ?? null,
      patch.active ?? null,
      patch.imageUrl !== undefined,
    ],
  );
  const row = result.rows[0];
  return row ? categoryFromSqlRow(row as CategorySqlRow) : null;
}

export async function categoryHasProductsInSupabase(categoryId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `select id from public.gemstone_products where category_id = $1 limit 1`,
    [categoryId],
  );
  return result.rows.length > 0;
}

export async function deleteCategoryInSupabase(id: string): Promise<void> {
  await query(`delete from public.gemstone_categories where id = $1`, [id]);
}

/* ----------------------------------- products ----------------------------------- */

export async function productSlugTakenInSupabase(slug: string, excludeId?: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `select id from public.gemstone_products where slug = $1 and ($2::text is null or id <> $2) limit 1`,
    [slug, excludeId ?? null],
  );
  return result.rows.length > 0;
}

export async function insertProductInSupabase(input: Omit<ProductRow, "id" | "createdAt" | "updatedAt">): Promise<ProductRow> {
  const result = await query<ProductSqlRow>(
    `insert into public.gemstone_products
       (id, category_id, name, slug, short_description, description, benefits, who_should_wear,
        recommended_zodiac, recommended_planets, origin, color, treatment, certification,
        certificate_url, currency, sku, featured, trending, bestseller, active,
        meta_title, meta_description)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     ${PRODUCT_RETURNING}`,
    [
      randomUUID(), input.categoryId, input.name, input.slug, input.shortDescription, input.description,
      input.benefits, input.whoShouldWear, input.recommendedZodiac, input.recommendedPlanets,
      input.origin, input.color, input.treatment, input.certification, input.certificateUrl,
      input.currency, input.sku, input.featured, input.trending, input.bestseller, input.active,
      input.metaTitle, input.metaDescription,
    ],
  );
  return productFromSqlRow(result.rows[0] as ProductSqlRow);
}

export async function updateProductInSupabase(
  id: string,
  patch: Partial<Omit<ProductRow, "id" | "createdAt" | "updatedAt">>,
): Promise<ProductRow | null> {
  const result = await query<ProductSqlRow>(
    `update public.gemstone_products
        set category_id = coalesce($2, category_id),
            name = coalesce($3, name),
            slug = coalesce($4, slug),
            short_description = coalesce($5, short_description),
            description = coalesce($6, description),
            benefits = coalesce($7, benefits),
            who_should_wear = coalesce($8, who_should_wear),
            recommended_zodiac = coalesce($9, recommended_zodiac),
            recommended_planets = coalesce($10, recommended_planets),
            origin = coalesce($11, origin),
            color = coalesce($12, color),
            treatment = coalesce($13, treatment),
            certification = coalesce($14, certification),
            certificate_url = coalesce($15, certificate_url),
            sku = coalesce($16, sku),
            featured = coalesce($17, featured),
            trending = coalesce($18, trending),
            bestseller = coalesce($19, bestseller),
            active = coalesce($20, active),
            meta_title = coalesce($21, meta_title),
            meta_description = coalesce($22, meta_description),
            updated_at = now()
      where id = $1
      ${PRODUCT_RETURNING}`,
    [
      id, patch.categoryId ?? null, patch.name ?? null, patch.slug ?? null,
      patch.shortDescription ?? null, patch.description ?? null, patch.benefits ?? null,
      patch.whoShouldWear ?? null, patch.recommendedZodiac ?? null, patch.recommendedPlanets ?? null,
      patch.origin ?? null, patch.color ?? null, patch.treatment ?? null, patch.certification ?? null,
      patch.certificateUrl ?? null, patch.sku ?? null, patch.featured ?? null, patch.trending ?? null,
      patch.bestseller ?? null, patch.active ?? null, patch.metaTitle ?? null, patch.metaDescription ?? null,
    ],
  );
  const row = result.rows[0];
  return row ? productFromSqlRow(row as ProductSqlRow) : null;
}

export async function getProductForAdminInSupabase(id: string): Promise<ProductRow | null> {
  const result = await query<ProductSqlRow>(
    `select id, category_id, name, slug, short_description, description, benefits, who_should_wear,
            recommended_zodiac, recommended_planets, origin, color, treatment, certification,
            certificate_url, currency, sku, featured, trending, bestseller, active,
            meta_title, meta_description, created_at, updated_at
       from public.gemstone_products where id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? productFromSqlRow(row as ProductSqlRow) : null;
}

/** Every product, newest first, for the admin list. */
export async function getAllProductRowsForAdminInSupabase(): Promise<ProductRow[]> {
  const result = await query<ProductSqlRow>(
    `select id, category_id, name, slug, short_description, description, benefits, who_should_wear,
            recommended_zodiac, recommended_planets, origin, color, treatment, certification,
            certificate_url, currency, sku, featured, trending, bestseller, active,
            meta_title, meta_description, created_at, updated_at
       from public.gemstone_products order by created_at desc`,
  );
  return result.rows.map((row) => productFromSqlRow(row as ProductSqlRow));
}

/** gemstone_order_items.product_id is not a foreign key, so this is an explicit
 * count rather than something a constraint would block for us. */
export async function productHasOrderItemsInSupabase(productId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `select id from public.gemstone_order_items where product_id = $1 limit 1`,
    [productId],
  );
  return result.rows.length > 0;
}

export async function deleteProductInSupabase(id: string): Promise<void> {
  // Images and variants cascade from the product's own foreign keys, but deleting
  // them explicitly keeps the statement order obvious and matches what the
  // Firestore batch did.
  await withTransaction(async (client) => {
    await client.query(`delete from public.gemstone_product_images where product_id = $1`, [id]);
    await client.query(`delete from public.gemstone_product_variants where product_id = $1`, [id]);
    await client.query(`delete from public.gemstone_products where id = $1`, [id]);
  });
}

/* ------------------------------- variants & images ------------------------------- */

export type VariantInputRow = {
  id?: string;
  label: string;
  weightCarat: string;
  weightRatti: string;
  certificationLevel: string;
  price: number;
  compareAtPrice: number | null;
  stockQuantity: number;
  sku: string;
  active: boolean;
};

/**
 * Replaces a product's variants to match the submitted list, and reports the two
 * signals the wishlist notification needs.
 *
 * The read of the old price/stock and the write of the new ones happen in one
 * transaction, so a concurrent edit cannot make priceDropped describe a change
 * that never landed.
 */
export async function replaceProductVariantsInSupabase(
  productId: string,
  variants: VariantInputRow[],
): Promise<{ priceDropped: boolean; backInStock: boolean }> {
  return withTransaction(async (client) => {
    const existing = await client.query<{ id: string; price: string; stock_quantity: number }>(
      `select id, price, stock_quantity from public.gemstone_product_variants where product_id = $1 for update`,
      [productId],
    );
    const existingById = new Map(existing.rows.map((row) => [row.id, { price: Number(row.price), stockQuantity: row.stock_quantity }]));
    const keepIds = new Set(variants.map((variant) => variant.id).filter((id): id is string => Boolean(id)));

    for (const row of existing.rows) {
      if (!keepIds.has(row.id)) {
        await client.query(`delete from public.gemstone_product_variants where id = $1`, [row.id]);
      }
    }

    let priceDropped = false;
    let backInStock = false;

    for (const variant of variants) {
      const prior = variant.id ? existingById.get(variant.id) : undefined;
      if (prior) {
        if (variant.price < prior.price) priceDropped = true;
        if (prior.stockQuantity <= 0 && variant.stockQuantity > 0) backInStock = true;
      }
      if (variant.id && prior) {
        await client.query(
          `update public.gemstone_product_variants
              set label = $2, weight_carat = $3, weight_ratti = $4, certification_level = $5,
                  price = $6, compare_at_price = $7, stock_quantity = $8, sku = $9,
                  active = $10, updated_at = now()
            where id = $1`,
          [
            variant.id, variant.label, variant.weightCarat, variant.weightRatti,
            variant.certificationLevel, variant.price, variant.compareAtPrice,
            variant.stockQuantity, variant.sku, variant.active,
          ],
        );
      } else {
        await client.query(
          `insert into public.gemstone_product_variants
             (id, product_id, label, weight_carat, weight_ratti, certification_level,
              price, compare_at_price, stock_quantity, sku, active)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            randomUUID(), productId, variant.label, variant.weightCarat, variant.weightRatti,
            variant.certificationLevel, variant.price, variant.compareAtPrice,
            variant.stockQuantity, variant.sku, variant.active,
          ],
        );
      }
    }

    return { priceDropped, backInStock };
  });
}

export type ImageInputRow = { id?: string; url: string; alt: string; sortOrder: number; isPrimary: boolean };

/**
 * Replaces a product's images to match the submitted list.
 *
 * Note the partial unique index gemstone_product_images_one_primary: at most one
 * row per product may have is_primary. Firestore imposed no such rule, so a
 * product saved with two primary images now fails here instead of silently
 * keeping both. Callers should validate before writing.
 */
export async function replaceProductImagesInSupabase(productId: string, images: ImageInputRow[]): Promise<void> {
  await withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      `select id from public.gemstone_product_images where product_id = $1 for update`,
      [productId],
    );
    const keepIds = new Set(images.map((image) => image.id).filter((id): id is string => Boolean(id)));

    for (const row of existing.rows) {
      if (!keepIds.has(row.id)) {
        await client.query(`delete from public.gemstone_product_images where id = $1`, [row.id]);
      }
    }

    for (const image of images) {
      if (image.id && keepIds.has(image.id)) {
        await client.query(
          `update public.gemstone_product_images
              set url = $2, alt = $3, sort_order = $4, is_primary = $5
            where id = $1 and product_id = $6`,
          [image.id, image.url, image.alt, image.sortOrder, image.isPrimary, productId],
        );
      } else {
        await client.query(
          `insert into public.gemstone_product_images
             (id, product_id, url, alt, sort_order, is_primary)
           values ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), productId, image.url, image.alt, image.sortOrder, image.isPrimary],
        );
      }
    }
  });
}

export async function getVariantsForAdminInSupabase(productId: string): Promise<VariantRow[]> {
  return queryModels<VariantRow>(
    `select id, product_id, label, weight_carat, weight_ratti, certification_level,
            price, compare_at_price, stock_quantity, sku, active, created_at, updated_at
       from public.gemstone_product_variants
      where product_id = $1
      order by price asc`,
    [productId],
    ["price", "compareAtPrice", "stockQuantity"],
  );
}

export async function getImagesForAdminInSupabase(productId: string): Promise<ImageRow[]> {
  return queryModels<ImageRow>(
    `select id, product_id, url, alt, sort_order, is_primary, created_at
       from public.gemstone_product_images
      where product_id = $1
      order by sort_order asc`,
    [productId],
    ["sortOrder"],
  );
}
