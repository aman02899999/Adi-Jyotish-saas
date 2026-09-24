import "server-only";

import { query, queryModels } from "@/lib/postgres";

/**
 * Postgres data access for the gemstone catalog.
 *
 * Deliberately data-only. The category/search/price/zodiac/planet filtering, the
 * six sort orders and the pagination in getProductCatalog all stay in
 * gemstones.ts, where both providers share them — that logic was written to
 * mirror the SQL behaviour in JS so it does not need re-deriving per database.
 *
 * The types are redeclared here rather than imported from gemstones.ts. An
 * `import type` would be erased at runtime and is technically safe, but a real
 * import would be circular, and keeping this module independent means the SQL
 * cannot be broken by a change to the Firestore module's exports.
 *
 * Two schema facts worth knowing:
 *  - gemstone_products has no price column. The storefront price is the cheapest
 *    active variant, which is why variants are always fetched alongside products.
 *  - price, compare_at_price, stock_quantity, sort_order and rating are numeric
 *    or integer. node-postgres returns numeric as a string, so each is named in a
 *    numericColumns list — an unnamed price makes the discount sort compare text.
 */

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductRow = {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  benefits: string;
  whoShouldWear: string;
  recommendedZodiac: string;
  recommendedPlanets: string;
  origin: string;
  color: string;
  treatment: string;
  certification: string;
  certificateUrl: string;
  currency: string;
  sku: string;
  featured: boolean;
  trending: boolean;
  bestseller: boolean;
  active: boolean;
  metaTitle: string;
  metaDescription: string;
  createdAt: Date;
  updatedAt: Date;
};

/** A product plus the category labels the storefront card needs. */
export type CatalogRow = { product: ProductRow; categoryName: string; categorySlug: string };

export type ImageRow = {
  id: string;
  productId: string;
  url: string;
  alt: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: Date;
};

export type VariantRow = {
  id: string;
  productId: string;
  label: string;
  weightCarat: string;
  weightRatti: string;
  certificationLevel: string;
  price: number;
  compareAtPrice: number | null;
  stockQuantity: number;
  sku: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const PRODUCT_SELECT = `
  select p.id, p.category_id, p.name, p.slug, p.short_description, p.description,
         p.benefits, p.who_should_wear, p.recommended_zodiac, p.recommended_planets,
         p.origin, p.color, p.treatment, p.certification, p.certificate_url,
         p.currency, p.sku, p.featured, p.trending, p.bestseller, p.active,
         p.meta_title, p.meta_description, p.created_at, p.updated_at,
         c.name as category_name, c.slug as category_slug`;

const PRODUCT_FROM = `
    from public.gemstone_products p
    left join public.gemstone_categories c on c.id = p.category_id`;

/** A left join means category_name can be null for a product whose category was
 * deleted; the Firestore path rendered those as "Uncategorized". */
type CatalogSqlRow = {
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
  category_name: string | null;
  category_slug: string | null;
};

function catalogFromSqlRow(row: CatalogSqlRow): CatalogRow {
  return {
    product: {
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
    },
    categoryName: row.category_name ?? "Uncategorized",
    categorySlug: row.category_slug ?? "",
  };
}

function catalogRowsFrom(result: { rows: CatalogSqlRow[] }): CatalogRow[] {
  return result.rows.map(catalogFromSqlRow);
}

/* ---------------------------------- categories ---------------------------------- */

const CATEGORY_NUMERIC_COLUMNS = ["sortOrder"] as const;

export async function getCategoriesInSupabase(activeOnly = false): Promise<CategoryRow[]> {
  return queryModels<CategoryRow>(
    `select id, name, slug, description, image_url, sort_order, active, created_at, updated_at
       from public.gemstone_categories
      ${activeOnly ? "where active = true" : ""}
      order by sort_order asc, name asc`,
    [],
    CATEGORY_NUMERIC_COLUMNS,
  );
}

export async function getCategoryBySlugInSupabase(slug: string): Promise<CategoryRow | null> {
  const rows = await queryModels<CategoryRow>(
    `select id, name, slug, description, image_url, sort_order, active, created_at, updated_at
       from public.gemstone_categories where slug = $1`,
    [slug],
    CATEGORY_NUMERIC_COLUMNS,
  );
  return rows[0] ?? null;
}

/** Categories with a live product count, for the admin list and the storefront nav. */
export async function getCategoriesWithProductCountInSupabase(activeOnly: boolean): Promise<Array<CategoryRow & { productCount: number }>> {
  const rows = await queryModels<CategoryRow & { productCount: number }>(
    `select c.id, c.name, c.slug, c.description, c.image_url, c.sort_order, c.active,
            c.created_at, c.updated_at,
            count(p.id)::int as product_count
       from public.gemstone_categories c
       left join public.gemstone_products p on p.category_id = c.id and p.active = true
      ${activeOnly ? "where c.active = true" : ""}
      group by c.id
      order by c.sort_order asc, c.name asc`,
    [],
    [...CATEGORY_NUMERIC_COLUMNS, "productCount"],
  );
  return rows;
}

/* ----------------------------------- products ----------------------------------- */

export async function getActiveCatalogRowsInSupabase(): Promise<CatalogRow[]> {
  return catalogRowsFrom(
    await query<CatalogSqlRow>(`${PRODUCT_SELECT}${PRODUCT_FROM} where p.active = true`),
  );
}

export async function getCatalogRowBySlugInSupabase(slug: string): Promise<CatalogRow | null> {
  const result = await query<CatalogSqlRow>(`${PRODUCT_SELECT}${PRODUCT_FROM} where p.slug = $1 limit 1`, [slug]);
  const row = result.rows[0];
  return row ? catalogFromSqlRow(row) : null;
}

export async function getCatalogRowsByIdsInSupabase(ids: string[]): Promise<CatalogRow[]> {
  if (!ids.length) return [];
  return catalogRowsFrom(
    await query<CatalogSqlRow>(`${PRODUCT_SELECT}${PRODUCT_FROM} where p.id = any($1::text[])`, [ids]),
  );
}

export async function getCatalogRowsBySlugsInSupabase(slugs: string[]): Promise<CatalogRow[]> {
  if (!slugs.length) return [];
  return catalogRowsFrom(
    await query<CatalogSqlRow>(`${PRODUCT_SELECT}${PRODUCT_FROM} where p.slug = any($1::text[])`, [slugs]),
  );
}

export async function getRelatedCatalogRowsInSupabase(categoryId: string, excludeProductId: string, limit: number): Promise<CatalogRow[]> {
  return catalogRowsFrom(
    await query<CatalogSqlRow>(
      `${PRODUCT_SELECT}${PRODUCT_FROM}
       where p.active = true and p.category_id = $1 and p.id <> $2
       order by p.featured desc, p.created_at desc
       limit $3`,
      [categoryId, excludeProductId, limit],
    ),
  );
}

/** Slug + updatedAt, which is what the sitemap/revalidate path needs to decide
 * whether a page is stale. */
export async function getActiveProductSlugsInSupabase(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  const result = await query<{ slug: string; updated_at: Date }>(
    `select slug, updated_at from public.gemstone_products where active = true`,
  );
  return result.rows.map((row) => ({ slug: row.slug, updatedAt: row.updated_at }));
}

/* ------------------------------- decoration data -------------------------------- */

const VARIANT_NUMERIC_COLUMNS = ["price", "compareAtPrice", "stockQuantity"] as const;

export async function getActiveVariantsInSupabase(productIds: string[]): Promise<VariantRow[]> {
  if (!productIds.length) return [];
  return queryModels<VariantRow>(
    `select id, product_id, label, weight_carat, weight_ratti, certification_level,
            price, compare_at_price, stock_quantity, sku, active, created_at, updated_at
       from public.gemstone_product_variants
      where product_id = any($1::text[]) and active = true
      order by product_id, price asc`,
    [productIds],
    VARIANT_NUMERIC_COLUMNS,
  );
}

const IMAGE_NUMERIC_COLUMNS = ["sortOrder"] as const;

export async function getImagesInSupabase(productIds: string[]): Promise<ImageRow[]> {
  if (!productIds.length) return [];
  return queryModels<ImageRow>(
    `select id, product_id, url, alt, sort_order, is_primary, created_at
       from public.gemstone_product_images
      where product_id = any($1::text[])
      order by product_id, sort_order asc`,
    [productIds],
    IMAGE_NUMERIC_COLUMNS,
  );
}

/**
 * Rating totals per product, summed in SQL.
 *
 * The Firestore path pulled every published review for the page (chunked to
 * respect the 30-item `in` limit) and added them up in JS. Aggregating here means
 * the review count per product no longer costs a row each.
 *
 * rating is smallint and the sums are numeric — both arrive as strings, hence the
 * explicit casts and the Number() calls.
 */
export async function getPublishedRatingTotalsInSupabase(
  productIds: string[],
): Promise<Map<string, { sum: number; count: number }>> {
  if (!productIds.length) return new Map();
  const result = await query<{ product_id: string; sum: string; count: string }>(
    `select product_id, sum(rating)::int as sum, count(*)::int as count
       from public.gemstone_reviews
      where product_id = any($1::text[]) and status = 'published'
      group by product_id`,
    [productIds],
  );
  return new Map(
    result.rows.map((row) => [row.product_id, { sum: Number(row.sum), count: Number(row.count) }]),
  );
}
