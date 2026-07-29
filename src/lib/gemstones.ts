import "server-only";

import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  gemstoneCategories,
  gemstoneProductImages,
  gemstoneProducts,
  gemstoneProductVariants,
  gemstoneReviews,
  type GemstoneCategory,
  type GemstoneProduct,
  type GemstoneProductImage,
  type GemstoneProductVariant,
} from "@/db/schema";
import { toSlug } from "@/lib/services";
import { seedGemstoneCatalog } from "@/lib/gemstones-seed";

export class GemstoneError extends Error {}

/* ---------------------------------- categories ---------------------------------- */

export async function getAllCategoriesAdmin(): Promise<Array<GemstoneCategory & { productCount: number }>> {
  await seedGemstoneCatalog();
  const categories = await db.select().from(gemstoneCategories).orderBy(asc(gemstoneCategories.sortOrder), asc(gemstoneCategories.id));
  const counts = await db.select({ categoryId: gemstoneProducts.categoryId, count: sql<number>`count(*)::int` })
    .from(gemstoneProducts).groupBy(gemstoneProducts.categoryId);
  const countMap = new Map(counts.map((row) => [row.categoryId, row.count]));
  return categories.map((category) => ({ ...category, productCount: countMap.get(category.id) ?? 0 }));
}

export async function getActiveCategories(): Promise<Array<GemstoneCategory & { productCount: number }>> {
  const all = await getAllCategoriesAdmin();
  return all.filter((category) => category.active);
}

export async function getCategoryBySlug(slug: string) {
  const [category] = await db.select().from(gemstoneCategories).where(eq(gemstoneCategories.slug, slug)).limit(1);
  return category ?? null;
}

export type CategoryPayload = { name?: string; slug?: string; description?: string; imageUrl?: string | null; sortOrder?: number; active?: boolean };

export async function createCategory(payload: CategoryPayload) {
  const name = payload.name?.trim();
  if (!name) throw new GemstoneError("Category name is required.");
  const slug = payload.slug?.trim() ? toSlug(payload.slug) : toSlug(name);
  const [created] = await db.insert(gemstoneCategories).values({
    name,
    slug,
    description: payload.description?.trim() ?? "",
    imageUrl: payload.imageUrl || null,
    sortOrder: Math.max(0, Number(payload.sortOrder) || 0),
    active: payload.active ?? true,
  }).returning();
  return created;
}

export async function updateCategory(id: number, payload: CategoryPayload) {
  const [updated] = await db.update(gemstoneCategories).set({
    name: payload.name?.trim() || undefined,
    slug: payload.slug?.trim() ? toSlug(payload.slug) : undefined,
    description: payload.description,
    imageUrl: payload.imageUrl === undefined ? undefined : payload.imageUrl || null,
    sortOrder: payload.sortOrder != null ? Math.max(0, Number(payload.sortOrder) || 0) : undefined,
    active: payload.active,
    updatedAt: new Date(),
  }).where(eq(gemstoneCategories.id, id)).returning();
  if (!updated) throw new GemstoneError("Category not found.");
  return updated;
}

export async function deleteCategory(id: number) {
  try {
    await db.delete(gemstoneCategories).where(eq(gemstoneCategories.id, id));
  } catch {
    throw new GemstoneError("This category still has products in it. Move or delete those products first.");
  }
}

/* ---------------------------------- product images/variants (shared shapes) ---------------------------------- */

export type ImageInput = { id?: number; url: string; alt?: string; sortOrder?: number; isPrimary?: boolean };
export type VariantInput = {
  id?: number;
  label: string;
  weightCarat?: string;
  weightRatti?: string;
  certificationLevel?: string;
  price: number;
  compareAtPrice?: number | null;
  stockQuantity: number;
  sku: string;
  active?: boolean;
};

async function replaceProductImages(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], productId: number, images: ImageInput[]) {
  const keepIds = images.filter((image) => image.id).map((image) => image.id!);
  if (keepIds.length) await tx.delete(gemstoneProductImages).where(and(eq(gemstoneProductImages.productId, productId), sql`${gemstoneProductImages.id} not in (${sql.join(keepIds, sql`,`)})`));
  else await tx.delete(gemstoneProductImages).where(eq(gemstoneProductImages.productId, productId));

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (image.id) {
      await tx.update(gemstoneProductImages).set({ url: image.url, alt: image.alt ?? "", sortOrder: index, isPrimary: Boolean(image.isPrimary) }).where(eq(gemstoneProductImages.id, image.id));
    } else {
      await tx.insert(gemstoneProductImages).values({ productId, url: image.url, alt: image.alt ?? "", sortOrder: index, isPrimary: Boolean(image.isPrimary) });
    }
  }
}

async function replaceProductVariants(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], productId: number, variants: VariantInput[]) {
  if (!variants.length) throw new GemstoneError("Every product needs at least one weight/price variant.");
  const keepIds = variants.filter((variant) => variant.id).map((variant) => variant.id!);
  if (keepIds.length) await tx.delete(gemstoneProductVariants).where(and(eq(gemstoneProductVariants.productId, productId), sql`${gemstoneProductVariants.id} not in (${sql.join(keepIds, sql`,`)})`));
  else await tx.delete(gemstoneProductVariants).where(eq(gemstoneProductVariants.productId, productId));

  for (const variant of variants) {
    const values = {
      label: variant.label.trim() || "Standard",
      weightCarat: variant.weightCarat?.trim() ?? "",
      weightRatti: variant.weightRatti?.trim() ?? "",
      certificationLevel: variant.certificationLevel?.trim() ?? "",
      price: Math.max(0, Math.round(Number(variant.price) || 0)),
      compareAtPrice: variant.compareAtPrice != null && Number(variant.compareAtPrice) > 0 ? Math.round(Number(variant.compareAtPrice)) : null,
      stockQuantity: Math.max(0, Math.round(Number(variant.stockQuantity) || 0)),
      sku: variant.sku.trim(),
      active: variant.active ?? true,
    };
    if (variant.id) {
      await tx.update(gemstoneProductVariants).set(values).where(eq(gemstoneProductVariants.id, variant.id));
    } else {
      await tx.insert(gemstoneProductVariants).values({ productId, ...values });
    }
  }
}

/* ---------------------------------- admin product CRUD ---------------------------------- */

export type ProductPayload = {
  categoryId?: number;
  name?: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  benefits?: string;
  whoShouldWear?: string;
  recommendedZodiac?: string;
  recommendedPlanets?: string;
  origin?: string;
  color?: string;
  treatment?: string;
  certification?: string;
  sku?: string;
  featured?: boolean;
  trending?: boolean;
  bestseller?: boolean;
  active?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  images?: ImageInput[];
  variants?: VariantInput[];
};

export async function getAllProductsAdmin() {
  const products = await db.select({ product: gemstoneProducts, categoryName: gemstoneCategories.name })
    .from(gemstoneProducts)
    .innerJoin(gemstoneCategories, eq(gemstoneProducts.categoryId, gemstoneCategories.id))
    .orderBy(desc(gemstoneProducts.createdAt));
  if (!products.length) return [];

  const ids = products.map((row) => row.product.id);
  const variants = await db.select().from(gemstoneProductVariants).where(inArray(gemstoneProductVariants.productId, ids));
  const stockByProduct = new Map<number, number>();
  const priceByProduct = new Map<number, number>();
  for (const variant of variants) {
    stockByProduct.set(variant.productId, (stockByProduct.get(variant.productId) ?? 0) + variant.stockQuantity);
    const current = priceByProduct.get(variant.productId);
    if (current === undefined || variant.price < current) priceByProduct.set(variant.productId, variant.price);
  }

  return products.map((row) => ({
    ...row.product,
    categoryName: row.categoryName,
    totalStock: stockByProduct.get(row.product.id) ?? 0,
    variantCount: variants.filter((variant) => variant.productId === row.product.id).length,
    startingPrice: priceByProduct.get(row.product.id) ?? 0,
  }));
}

export async function getProductAdminById(id: number): Promise<{ product: GemstoneProduct; images: GemstoneProductImage[]; variants: GemstoneProductVariant[] } | null> {
  const [product] = await db.select().from(gemstoneProducts).where(eq(gemstoneProducts.id, id)).limit(1);
  if (!product) return null;
  const images = await db.select().from(gemstoneProductImages).where(eq(gemstoneProductImages.productId, id)).orderBy(asc(gemstoneProductImages.sortOrder));
  const variants = await db.select().from(gemstoneProductVariants).where(eq(gemstoneProductVariants.productId, id)).orderBy(asc(gemstoneProductVariants.id));
  return { product, images, variants };
}

export async function createProduct(payload: ProductPayload) {
  const name = payload.name?.trim();
  if (!name) throw new GemstoneError("Product name is required.");
  if (!payload.categoryId) throw new GemstoneError("Choose a category.");
  const sku = payload.sku?.trim();
  if (!sku) throw new GemstoneError("SKU is required.");
  const slug = payload.slug?.trim() ? toSlug(payload.slug) : toSlug(name);

  return db.transaction(async (tx) => {
    const [created] = await tx.insert(gemstoneProducts).values({
      categoryId: payload.categoryId!,
      name,
      slug,
      shortDescription: payload.shortDescription?.trim() ?? "",
      description: payload.description?.trim() ?? "",
      benefits: payload.benefits?.trim() ?? "",
      whoShouldWear: payload.whoShouldWear?.trim() ?? "",
      recommendedZodiac: payload.recommendedZodiac?.trim() ?? "",
      recommendedPlanets: payload.recommendedPlanets?.trim() ?? "",
      origin: payload.origin?.trim() ?? "",
      color: payload.color?.trim() ?? "",
      treatment: payload.treatment?.trim() ?? "",
      certification: payload.certification?.trim() ?? "",
      sku,
      featured: payload.featured ?? false,
      trending: payload.trending ?? false,
      bestseller: payload.bestseller ?? false,
      active: payload.active ?? true,
      metaTitle: payload.metaTitle?.trim() ?? "",
      metaDescription: payload.metaDescription?.trim() ?? "",
    }).returning();

    await replaceProductVariants(tx, created.id, payload.variants ?? []);
    if (payload.images?.length) await replaceProductImages(tx, created.id, payload.images);
    return created;
  });
}

export async function updateProduct(id: number, payload: ProductPayload) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(gemstoneProducts).where(eq(gemstoneProducts.id, id)).limit(1);
    if (!existing) throw new GemstoneError("Product not found.");

    const [updated] = await tx.update(gemstoneProducts).set({
      categoryId: payload.categoryId ?? existing.categoryId,
      name: payload.name?.trim() || existing.name,
      slug: payload.slug?.trim() ? toSlug(payload.slug) : existing.slug,
      shortDescription: payload.shortDescription ?? existing.shortDescription,
      description: payload.description ?? existing.description,
      benefits: payload.benefits ?? existing.benefits,
      whoShouldWear: payload.whoShouldWear ?? existing.whoShouldWear,
      recommendedZodiac: payload.recommendedZodiac ?? existing.recommendedZodiac,
      recommendedPlanets: payload.recommendedPlanets ?? existing.recommendedPlanets,
      origin: payload.origin ?? existing.origin,
      color: payload.color ?? existing.color,
      treatment: payload.treatment ?? existing.treatment,
      certification: payload.certification ?? existing.certification,
      sku: payload.sku?.trim() || existing.sku,
      featured: payload.featured ?? existing.featured,
      trending: payload.trending ?? existing.trending,
      bestseller: payload.bestseller ?? existing.bestseller,
      active: payload.active ?? existing.active,
      metaTitle: payload.metaTitle ?? existing.metaTitle,
      metaDescription: payload.metaDescription ?? existing.metaDescription,
      updatedAt: new Date(),
    }).where(eq(gemstoneProducts.id, id)).returning();

    if (payload.variants) await replaceProductVariants(tx, id, payload.variants);
    if (payload.images) await replaceProductImages(tx, id, payload.images);
    return updated;
  });
}

export async function duplicateProduct(id: number) {
  const detail = await getProductAdminById(id);
  if (!detail) throw new GemstoneError("Product not found.");
  const { product, images, variants } = detail;
  const suffix = Date.now().toString(36).slice(-4);
  return createProduct({
    categoryId: product.categoryId,
    name: `${product.name} (Copy)`,
    slug: `${product.slug}-copy-${suffix}`,
    shortDescription: product.shortDescription,
    description: product.description,
    benefits: product.benefits,
    whoShouldWear: product.whoShouldWear,
    recommendedZodiac: product.recommendedZodiac,
    recommendedPlanets: product.recommendedPlanets,
    origin: product.origin,
    color: product.color,
    treatment: product.treatment,
    certification: product.certification,
    sku: `${product.sku}-COPY-${suffix}`,
    featured: false,
    trending: false,
    bestseller: false,
    active: false,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    images: images.map((image) => ({ url: image.url, alt: image.alt, isPrimary: image.isPrimary })),
    variants: variants.map((variant) => ({ label: variant.label, weightCarat: variant.weightCarat, weightRatti: variant.weightRatti, certificationLevel: variant.certificationLevel, price: variant.price, compareAtPrice: variant.compareAtPrice, stockQuantity: 0, sku: `${variant.sku}-COPY-${suffix}` })),
  });
}

export async function deleteProduct(id: number) {
  try {
    await db.delete(gemstoneProducts).where(eq(gemstoneProducts.id, id));
  } catch {
    throw new GemstoneError("This product has existing orders and cannot be deleted. Archive it instead.");
  }
}

/* ---------------------------------- public catalog ---------------------------------- */

export type ProductListItem = {
  id: number;
  slug: string;
  name: string;
  shortDescription: string;
  categoryName: string;
  categorySlug: string;
  primaryImageUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  inStock: boolean;
  totalStock: number;
  defaultVariantId: number | null;
  defaultVariantLabel: string | null;
  defaultVariantStock: number;
  ratingAverage: number;
  ratingCount: number;
  featured: boolean;
  trending: boolean;
  bestseller: boolean;
  createdAt: Date;
};

export type ProductFilters = {
  category?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  zodiac?: string;
  planet?: string;
  certification?: string;
  featured?: boolean;
  trending?: boolean;
  bestseller?: boolean;
  sort?: "price_asc" | "price_desc" | "newest" | "rating" | "discount" | "alpha";
  page?: number;
  pageSize?: number;
};

async function decorateProducts(products: Array<{ product: GemstoneProduct; categoryName: string; categorySlug: string }>): Promise<ProductListItem[]> {
  if (!products.length) return [];
  const ids = products.map((row) => row.product.id);

  const [variants, images, reviews] = await Promise.all([
    db.select().from(gemstoneProductVariants).where(and(inArray(gemstoneProductVariants.productId, ids), eq(gemstoneProductVariants.active, true))),
    db.select().from(gemstoneProductImages).where(inArray(gemstoneProductImages.productId, ids)).orderBy(asc(gemstoneProductImages.sortOrder)),
    db.select({ productId: gemstoneReviews.productId, rating: gemstoneReviews.rating }).from(gemstoneReviews).where(and(inArray(gemstoneReviews.productId, ids), eq(gemstoneReviews.status, "published"))),
  ]);

  const variantsByProduct = new Map<number, GemstoneProductVariant[]>();
  for (const variant of variants) variantsByProduct.set(variant.productId, [...(variantsByProduct.get(variant.productId) ?? []), variant]);

  const imageByProduct = new Map<number, GemstoneProductImage>();
  for (const image of images) {
    const current = imageByProduct.get(image.productId);
    if (!current || (image.isPrimary && !current.isPrimary)) imageByProduct.set(image.productId, image);
  }

  const ratingByProduct = new Map<number, { sum: number; count: number }>();
  for (const review of reviews) {
    const current = ratingByProduct.get(review.productId) ?? { sum: 0, count: 0 };
    ratingByProduct.set(review.productId, { sum: current.sum + review.rating, count: current.count + 1 });
  }

  return products.map((row) => {
    const productVariants = variantsByProduct.get(row.product.id) ?? [];
    const cheapest = productVariants.reduce<GemstoneProductVariant | null>((best, current) => (!best || current.price < best.price ? current : best), null);
    const totalStock = productVariants.reduce((sum, variant) => sum + variant.stockQuantity, 0);
    const rating = ratingByProduct.get(row.product.id);
    return {
      id: row.product.id,
      slug: row.product.slug,
      name: row.product.name,
      shortDescription: row.product.shortDescription,
      categoryName: row.categoryName,
      categorySlug: row.categorySlug,
      primaryImageUrl: imageByProduct.get(row.product.id)?.url ?? null,
      price: cheapest?.price ?? 0,
      compareAtPrice: cheapest?.compareAtPrice ?? null,
      currency: row.product.currency,
      inStock: totalStock > 0,
      totalStock,
      defaultVariantId: cheapest?.id ?? null,
      defaultVariantLabel: cheapest?.label ?? null,
      defaultVariantStock: cheapest?.stockQuantity ?? 0,
      ratingAverage: rating ? Math.round((rating.sum / rating.count) * 10) / 10 : 0,
      ratingCount: rating?.count ?? 0,
      featured: row.product.featured,
      trending: row.product.trending,
      bestseller: row.product.bestseller,
      createdAt: row.product.createdAt,
    };
  });
}

export async function getProductCatalog(filters: ProductFilters = {}): Promise<{ items: ProductListItem[]; total: number; page: number; pageSize: number }> {
  await seedGemstoneCatalog();
  const conditions = [eq(gemstoneProducts.active, true)];
  if (filters.category) conditions.push(eq(gemstoneCategories.slug, filters.category));
  if (filters.featured) conditions.push(eq(gemstoneProducts.featured, true));
  if (filters.trending) conditions.push(eq(gemstoneProducts.trending, true));
  if (filters.bestseller) conditions.push(eq(gemstoneProducts.bestseller, true));
  if (filters.certification) conditions.push(ilike(gemstoneProducts.certification, `%${filters.certification}%`));
  if (filters.zodiac) conditions.push(ilike(gemstoneProducts.recommendedZodiac, `%${filters.zodiac}%`));
  if (filters.planet) conditions.push(ilike(gemstoneProducts.recommendedPlanets, `%${filters.planet}%`));
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(gemstoneProducts.name, term), ilike(gemstoneProducts.shortDescription, term), ilike(gemstoneProducts.recommendedZodiac, term), ilike(gemstoneProducts.recommendedPlanets, term))!);
  }

  const rows = await db.select({ product: gemstoneProducts, categoryName: gemstoneCategories.name, categorySlug: gemstoneCategories.slug })
    .from(gemstoneProducts)
    .innerJoin(gemstoneCategories, eq(gemstoneProducts.categoryId, gemstoneCategories.id))
    .where(and(...conditions));

  let items = await decorateProducts(rows);

  if (filters.minPrice != null) items = items.filter((item) => item.price >= filters.minPrice!);
  if (filters.maxPrice != null) items = items.filter((item) => item.price <= filters.maxPrice!);

  const sort = filters.sort ?? "newest";
  items = [...items].sort((a, b) => {
    if (sort === "price_asc") return a.price - b.price;
    if (sort === "price_desc") return b.price - a.price;
    if (sort === "rating") return b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount;
    if (sort === "alpha") return a.name.localeCompare(b.name);
    if (sort === "discount") {
      const discountA = a.compareAtPrice ? (a.compareAtPrice - a.price) / a.compareAtPrice : 0;
      const discountB = b.compareAtPrice ? (b.compareAtPrice - b.price) / b.compareAtPrice : 0;
      return discountB - discountA;
    }
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  });

  const total = items.length;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, filters.pageSize ?? 12));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page, pageSize };
}

export async function getProductBySlug(slug: string) {
  await seedGemstoneCatalog();
  const [row] = await db.select({ product: gemstoneProducts, categoryName: gemstoneCategories.name, categorySlug: gemstoneCategories.slug })
    .from(gemstoneProducts)
    .innerJoin(gemstoneCategories, eq(gemstoneProducts.categoryId, gemstoneCategories.id))
    .where(and(eq(gemstoneProducts.slug, slug), eq(gemstoneProducts.active, true)))
    .limit(1);
  if (!row) return null;

  const [images, variants, reviews] = await Promise.all([
    db.select().from(gemstoneProductImages).where(eq(gemstoneProductImages.productId, row.product.id)).orderBy(asc(gemstoneProductImages.sortOrder)),
    db.select().from(gemstoneProductVariants).where(and(eq(gemstoneProductVariants.productId, row.product.id), eq(gemstoneProductVariants.active, true))).orderBy(asc(gemstoneProductVariants.price)),
    db.select({ rating: gemstoneReviews.rating }).from(gemstoneReviews).where(and(eq(gemstoneReviews.productId, row.product.id), eq(gemstoneReviews.status, "published"))),
  ]);

  const ratingAverage = reviews.length ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) / 10 : 0;

  return {
    ...row.product,
    categoryName: row.categoryName,
    categorySlug: row.categorySlug,
    images,
    variants,
    ratingAverage,
    ratingCount: reviews.length,
  };
}

export async function getRelatedProducts(categoryId: number, excludeProductId: number, limit = 4): Promise<ProductListItem[]> {
  const rows = await db.select({ product: gemstoneProducts, categoryName: gemstoneCategories.name, categorySlug: gemstoneCategories.slug })
    .from(gemstoneProducts)
    .innerJoin(gemstoneCategories, eq(gemstoneProducts.categoryId, gemstoneCategories.id))
    .where(and(eq(gemstoneProducts.categoryId, categoryId), eq(gemstoneProducts.active, true), ne(gemstoneProducts.id, excludeProductId)))
    .limit(limit);
  return decorateProducts(rows);
}

export async function getProductsByIds(ids: number[]): Promise<ProductListItem[]> {
  if (!ids.length) return [];
  const rows = await db.select({ product: gemstoneProducts, categoryName: gemstoneCategories.name, categorySlug: gemstoneCategories.slug })
    .from(gemstoneProducts)
    .innerJoin(gemstoneCategories, eq(gemstoneProducts.categoryId, gemstoneCategories.id))
    .where(and(inArray(gemstoneProducts.id, ids), eq(gemstoneProducts.active, true)));
  return decorateProducts(rows);
}

export async function getAllActiveProductSlugs() {
  const rows = await db.select({ slug: gemstoneProducts.slug, updatedAt: gemstoneProducts.updatedAt }).from(gemstoneProducts).where(eq(gemstoneProducts.active, true));
  return rows;
}

export async function getProductsBySlugs(slugs: string[]): Promise<ProductListItem[]> {
  if (!slugs.length) return [];
  const rows = await db.select({ product: gemstoneProducts, categoryName: gemstoneCategories.name, categorySlug: gemstoneCategories.slug })
    .from(gemstoneProducts)
    .innerJoin(gemstoneCategories, eq(gemstoneProducts.categoryId, gemstoneCategories.id))
    .where(and(inArray(gemstoneProducts.slug, slugs), eq(gemstoneProducts.active, true)));
  const decorated = await decorateProducts(rows);
  const bySlug = new Map(decorated.map((item) => [item.slug, item]));
  return slugs.map((slug) => bySlug.get(slug)).filter((item): item is ProductListItem => Boolean(item));
}
