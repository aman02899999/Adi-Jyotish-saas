import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import {
  getActiveProductSlugsInSupabase,
  getActiveVariantsInSupabase,
  getActiveCatalogRowsInSupabase,
  getCategoriesWithProductCountInSupabase,
  getCategoryBySlugInSupabase,
  getCatalogRowBySlugInSupabase,
  getCatalogRowsByIdsInSupabase,
  getCatalogRowsBySlugsInSupabase,
  getImagesInSupabase,
  getPublishedRatingTotalsInSupabase,
  getRelatedCatalogRowsInSupabase,
} from "@/lib/gemstones-supabase";
import {
  categoryHasProductsInSupabase,
  categorySlugTakenInSupabase,
  deleteCategoryInSupabase,
  deleteProductInSupabase,
  getImagesForAdminInSupabase,
  getProductForAdminInSupabase,
  getVariantsForAdminInSupabase,
  insertCategoryInSupabase,
  insertProductInSupabase,
  productHasOrderItemsInSupabase,
  productSlugTakenInSupabase,
  replaceProductImagesInSupabase,
  replaceProductVariantsInSupabase,
  updateCategoryInSupabase,
  updateProductInSupabase,
} from "@/lib/gemstones-admin-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { isUniqueViolation } from "@/lib/postgres";
import { toSlug } from "@/lib/services";
import { seedGemstoneCatalog } from "@/lib/gemstones-seed";

export class GemstoneError extends Error {}

/** `Number(x) || 0` neutralizes NaN but not Infinity/-Infinity (both truthy), so a client sending
 * the JSON string "Infinity" for a price/stock field would otherwise pass straight through into
 * Firestore and corrupt price sorting/filtering on the storefront. */
function finiteOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Every other free-text field written by this codebase caps length before storing (promo-banner,
 * notifications) - these gemstone category/product fields didn't, so an arbitrarily large string
 * could push a single product doc past Firestore's 1MB limit and fail the whole write. */
function capText(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

/* ---------------------------------- collection refs ---------------------------------- */

const categoriesCol = db.collection("gemstoneCategories");
const productsCol = db.collection("gemstoneProducts");
const reviewsCol = db.collection("gemstoneReviews");

function imagesCol(productId: string) {
  return productsCol.doc(productId).collection("images");
}
function variantsCol(productId: string) {
  return productsCol.doc(productId).collection("variants");
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ---------------------------------- types ---------------------------------- */

export type GemstoneCategory = {
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

export type GemstoneProduct = {
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

export type GemstoneProductImage = {
  id: string;
  productId: string;
  url: string;
  alt: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: Date;
};

export type GemstoneProductVariant = {
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

function fromCategoryDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): GemstoneCategory {
  const data = doc.data() as Omit<GemstoneCategory, "id" | "createdAt" | "updatedAt"> & { createdAt?: Timestamp; updatedAt?: Timestamp };
  return { ...data, id: doc.id, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
}

function fromProductDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): GemstoneProduct {
  const data = doc.data() as Omit<GemstoneProduct, "id" | "createdAt" | "updatedAt"> & { createdAt?: Timestamp; updatedAt?: Timestamp };
  return { ...data, id: doc.id, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
}

function fromImageDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): GemstoneProductImage {
  const data = doc.data() as Omit<GemstoneProductImage, "id" | "createdAt"> & { createdAt?: Timestamp };
  return { ...data, id: doc.id, createdAt: toDate(data.createdAt) };
}

function fromVariantDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): GemstoneProductVariant {
  const data = doc.data() as Omit<GemstoneProductVariant, "id" | "createdAt" | "updatedAt"> & { createdAt?: Timestamp; updatedAt?: Timestamp };
  return { ...data, id: doc.id, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
}

/* ---------------------------------- categories ---------------------------------- */

export async function getAllCategoriesAdmin(): Promise<Array<GemstoneCategory & { productCount: number }>> {
  if (isSupabaseCutoverActive()) return getCategoriesWithProductCountInSupabase(false);
  await seedGemstoneCatalog();
  const snap = await categoriesCol.orderBy("sortOrder", "asc").orderBy("createdAt", "asc").get();
  const categories = snap.docs.map(fromCategoryDoc);
  if (!categories.length) return [];

  const counts = await Promise.all(categories.map((category) => productsCol.where("categoryId", "==", category.id).count().get()));
  return categories.map((category, index) => ({ ...category, productCount: counts[index].data().count }));
}

export async function getActiveCategories(): Promise<Array<GemstoneCategory & { productCount: number }>> {
  const all = await getAllCategoriesAdmin();
  return all.filter((category) => category.active);
}

export async function getCategoryBySlug(slug: string) {
  if (isSupabaseCutoverActive()) return getCategoryBySlugInSupabase(slug);
  const snap = await categoriesCol.where("slug", "==", slug).limit(1).get();
  if (snap.empty) return null;
  return fromCategoryDoc(snap.docs[0]);
}

export type CategoryPayload = { name?: string; slug?: string; description?: string; imageUrl?: string | null; sortOrder?: number; active?: boolean };

export async function createCategory(payload: CategoryPayload) {
  const name = payload.name?.trim().slice(0, 200);
  if (!name) throw new GemstoneError("Category name is required.");
  const slug = payload.slug?.trim() ? toSlug(payload.slug) : toSlug(name);

  if (isSupabaseCutoverActive()) {
    if (await categorySlugTakenInSupabase(slug)) throw new GemstoneError("A category with this slug already exists.");
    try {
      return await insertCategoryInSupabase({
        name,
        slug,
        description: capText(payload.description, 2000),
        imageUrl: payload.imageUrl || null,
        sortOrder: Math.max(0, finiteOrZero(payload.sortOrder)),
        active: payload.active ?? true,
      });
    } catch (error) {
      // The pre-check above races with a concurrent save; slug is UNIQUE, so the
      // constraint is the real guard and is reported the same way.
      if (isUniqueViolation(error)) throw new GemstoneError("A category with this slug already exists.");
      throw error;
    }
  }

  const existing = await categoriesCol.where("slug", "==", slug).limit(1).get();
  if (!existing.empty) throw new GemstoneError("A category with this slug already exists.");

  const ref = categoriesCol.doc();
  await ref.set({
    name,
    slug,
    description: capText(payload.description, 2000),
    imageUrl: payload.imageUrl || null,
    sortOrder: Math.max(0, finiteOrZero(payload.sortOrder)),
    active: payload.active ?? true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const created = await ref.get();
  return fromCategoryDoc(created);
}

export async function updateCategory(id: string, payload: CategoryPayload) {
  if (isSupabaseCutoverActive()) {
    const patch: Parameters<typeof updateCategoryInSupabase>[1] = {};
    if (payload.name?.trim()) patch.name = payload.name.trim().slice(0, 200);
    if (payload.slug?.trim()) {
      const slug = toSlug(payload.slug);
      if (await categorySlugTakenInSupabase(slug, id)) throw new GemstoneError("A category with this slug already exists.");
      patch.slug = slug;
    }
    if (payload.description !== undefined) patch.description = capText(payload.description, 2000);
    if (payload.imageUrl !== undefined) patch.imageUrl = payload.imageUrl || null;
    if (payload.sortOrder != null) patch.sortOrder = Math.max(0, finiteOrZero(payload.sortOrder));
    if (payload.active !== undefined) patch.active = payload.active;
    try {
      const updated = await updateCategoryInSupabase(id, patch);
      if (!updated) throw new GemstoneError("Category not found.");
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) throw new GemstoneError("A category with this slug already exists.");
      throw error;
    }
  }

  const ref = categoriesCol.doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new GemstoneError("Category not found.");

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (payload.name?.trim()) update.name = payload.name.trim().slice(0, 200);
  if (payload.slug?.trim()) {
    const slug = toSlug(payload.slug);
    const existingSlug = await categoriesCol.where("slug", "==", slug).limit(1).get();
    if (!existingSlug.empty && existingSlug.docs[0].id !== id) throw new GemstoneError("A category with this slug already exists.");
    update.slug = slug;
  }
  if (payload.description !== undefined) update.description = capText(payload.description, 2000);
  if (payload.imageUrl !== undefined) update.imageUrl = payload.imageUrl || null;
  if (payload.sortOrder != null) update.sortOrder = Math.max(0, finiteOrZero(payload.sortOrder));
  if (payload.active !== undefined) update.active = payload.active;

  await ref.update(update);
  const updated = await ref.get();
  return fromCategoryDoc(updated);
}

export async function deleteCategory(id: string) {
  if (isSupabaseCutoverActive()) {
    if (await categoryHasProductsInSupabase(id)) {
      throw new GemstoneError("This category still has products in it. Move or delete those products first.");
    }
    await deleteCategoryInSupabase(id);
    return;
  }

  const inUse = await productsCol.where("categoryId", "==", id).limit(1).get();
  if (!inUse.empty) throw new GemstoneError("This category still has products in it. Move or delete those products first.");
  await categoriesCol.doc(id).delete();
}

/* ---------------------------------- product images/variants (shared shapes) ---------------------------------- */

export type ImageInput = { id?: string; url: string; alt?: string; sortOrder?: number; isPrimary?: boolean };
export type VariantInput = {
  id?: string;
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

/** Called before any product doc is written. Without this, a variant/image missing its required
 * string field only throws once replaceProductVariants/replaceProductImages runs *after* the
 * product doc's own ref.set()/ref.update() already committed - leaving an orphaned or
 * half-updated product in Firestore behind a generic "could not be created/updated" error. */
function validateVariants(variants: VariantInput[]) {
  if (!variants.length) throw new GemstoneError("Every product needs at least one weight/price variant.");
  for (const variant of variants) {
    if (typeof variant.label !== "string") throw new GemstoneError("Every variant needs a label.");
    if (typeof variant.sku !== "string") throw new GemstoneError("Every variant needs a SKU.");
  }
}
function validateImages(images: ImageInput[]) {
  for (const image of images) {
    if (typeof image.url !== "string") throw new GemstoneError("Every image needs a URL.");
  }
}

/** Variant field rules, normalised once and shared by both providers. Keeping
 * this above the branch is what stops the Firestore and Postgres paths drifting
 * apart on rounding, defaults or trimming. */
function normalizeVariantInput(variant: VariantInput) {
  return {
    id: variant.id,
    label: variant.label.trim() || "Standard",
    weightCarat: variant.weightCarat?.trim() ?? "",
    weightRatti: variant.weightRatti?.trim() ?? "",
    certificationLevel: variant.certificationLevel?.trim() ?? "",
    price: Math.max(0, Math.round(finiteOrZero(variant.price))),
    compareAtPrice: variant.compareAtPrice != null && finiteOrZero(variant.compareAtPrice) > 0 ? Math.round(finiteOrZero(variant.compareAtPrice)) : null,
    stockQuantity: Math.max(0, Math.round(finiteOrZero(variant.stockQuantity))),
    sku: variant.sku.trim(),
    active: variant.active ?? true,
  };
}

/** sortOrder is the position in the submitted list, not a caller-supplied value —
 * the admin form reorders by dragging, so the array order is the source of truth. */
function normalizeImageInput(image: ImageInput, index: number) {
  return {
    id: image.id,
    url: image.url,
    alt: image.alt ?? "",
    sortOrder: index,
    isPrimary: Boolean(image.isPrimary),
  };
}

async function replaceProductImages(productId: string, images: ImageInput[]) {
  const normalized = images.map(normalizeImageInput);
  if (isSupabaseCutoverActive()) {
    await replaceProductImagesInSupabase(productId, normalized);
    return;
  }

  const col = imagesCol(productId);
  const existingSnap = await col.get();
  const keepIds = new Set(normalized.filter((image) => image.id).map((image) => image.id!));

  const batch = db.batch();
  existingSnap.docs.forEach((doc) => {
    if (!keepIds.has(doc.id)) batch.delete(doc.ref);
  });
  normalized.forEach((image) => {
    const { id, ...values } = image;
    if (id) {
      batch.update(col.doc(id), values);
    } else {
      batch.set(col.doc(), { productId, ...values, createdAt: FieldValue.serverTimestamp() });
    }
  });
  await batch.commit();
}

/** Returns which wishlist-relevant changes this save produced (a price cut, or a 0→available
 * restock) by comparing each matched variant's prior price/stockQuantity against the incoming
 * values before they're overwritten — the caller uses this to trigger wishlist notifications
 * without gemstones.ts itself depending on the wishlist module. */
async function replaceProductVariants(productId: string, variants: VariantInput[]): Promise<{ priceDropped: boolean; backInStock: boolean }> {
  if (!variants.length) throw new GemstoneError("Every product needs at least one weight/price variant.");
  const normalized = variants.map(normalizeVariantInput);
  if (isSupabaseCutoverActive()) {
    return replaceProductVariantsInSupabase(productId, normalized);
  }

  const col = variantsCol(productId);
  const existingSnap = await col.get();
  const existingById = new Map(existingSnap.docs.map((doc) => [doc.id, doc.data() as { price?: number; stockQuantity?: number }]));
  const keepIds = new Set(normalized.filter((variant) => variant.id).map((variant) => variant.id!));

  let priceDropped = false;
  let backInStock = false;

  const batch = db.batch();
  existingSnap.docs.forEach((doc) => {
    if (!keepIds.has(doc.id)) batch.delete(doc.ref);
  });
  for (const entry of normalized) {
    const { id, ...rest } = entry;
    const values = { productId, ...rest };
    const prior = id ? existingById.get(id) : undefined;
    if (prior) {
      if (typeof prior.price === "number" && values.price < prior.price) priceDropped = true;
      if ((prior.stockQuantity ?? 0) <= 0 && values.stockQuantity > 0) backInStock = true;
    }
    if (id) {
      batch.update(col.doc(id), { ...values, updatedAt: FieldValue.serverTimestamp() });
    } else {
      batch.set(col.doc(), { ...values, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
  }
  await batch.commit();
  return { priceDropped, backInStock };
}

/* ---------------------------------- admin product CRUD ---------------------------------- */

export type ProductPayload = {
  categoryId?: string;
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
  certificateUrl?: string;
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
  const snap = await productsCol.orderBy("createdAt", "desc").get();
  const products = snap.docs.map(fromProductDoc);
  if (!products.length) return [];

  const categoryIds = [...new Set(products.map((product) => product.categoryId))];
  const categorySnaps = categoryIds.length ? await db.getAll(...categoryIds.map((id) => categoriesCol.doc(id))) : [];
  const categoryNameById = new Map(categorySnaps.map((categorySnap) => [categorySnap.id, (categorySnap.data()?.name as string | undefined) ?? "Uncategorized"]));

  const variantSnaps = await Promise.all(products.map((product) => variantsCol(product.id).get()));

  return products.map((product, index) => {
    const variants = variantSnaps[index].docs.map(fromVariantDoc);
    const totalStock = variants.reduce((sum, variant) => sum + variant.stockQuantity, 0);
    const startingPrice = variants.reduce<number | null>((min, variant) => (min === null || variant.price < min ? variant.price : min), null) ?? 0;
    return {
      ...product,
      categoryName: categoryNameById.get(product.categoryId) ?? "Uncategorized",
      totalStock,
      variantCount: variants.length,
      startingPrice,
    };
  });
}

export async function getProductAdminById(id: string): Promise<{ product: GemstoneProduct; images: GemstoneProductImage[]; variants: GemstoneProductVariant[] } | null> {
  if (isSupabaseCutoverActive()) {
    const product = await getProductForAdminInSupabase(id);
    if (!product) return null;
    const [images, variants] = await Promise.all([
      getImagesForAdminInSupabase(id),
      getVariantsForAdminInSupabase(id),
    ]);
    return { product, images, variants };
  }

  const ref = productsCol.doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const [imagesSnap, variantsSnap] = await Promise.all([
    imagesCol(id).orderBy("sortOrder", "asc").get(),
    variantsCol(id).orderBy("createdAt", "asc").get(),
  ]);
  return { product: fromProductDoc(snap), images: imagesSnap.docs.map(fromImageDoc), variants: variantsSnap.docs.map(fromVariantDoc) };
}

export async function createProduct(payload: ProductPayload) {
  const name = payload.name?.trim().slice(0, 200);
  if (!name) throw new GemstoneError("Product name is required.");
  if (!payload.categoryId) throw new GemstoneError("Choose a category.");
  const sku = payload.sku?.trim();
  if (!sku) throw new GemstoneError("SKU is required.");
  const slug = payload.slug?.trim() ? toSlug(payload.slug) : toSlug(name);
  validateVariants(payload.variants ?? []);
  if (payload.images?.length) validateImages(payload.images);

  if (isSupabaseCutoverActive()) {
    if (await productSlugTakenInSupabase(slug)) throw new GemstoneError("A product with this slug already exists.");
    try {
      const product = await insertProductInSupabase({
        categoryId: payload.categoryId,
        name,
        slug,
        shortDescription: capText(payload.shortDescription, 300),
        description: capText(payload.description, 4000),
        benefits: capText(payload.benefits, 2000),
        whoShouldWear: capText(payload.whoShouldWear, 1000),
        recommendedZodiac: capText(payload.recommendedZodiac, 200),
        recommendedPlanets: capText(payload.recommendedPlanets, 200),
        origin: capText(payload.origin, 200),
        color: capText(payload.color, 100),
        treatment: capText(payload.treatment, 200),
        certification: capText(payload.certification, 200),
        certificateUrl: capText(payload.certificateUrl, 500),
        currency: "INR",
        sku,
        featured: payload.featured ?? false,
        trending: payload.trending ?? false,
        bestseller: payload.bestseller ?? false,
        active: payload.active ?? true,
        metaTitle: capText(payload.metaTitle, 200),
        metaDescription: capText(payload.metaDescription, 300),
      });
      // Same order as the Firestore path: the product row first, then its
      // variants, so a variant write never references a missing parent.
      await replaceProductVariants(product.id, payload.variants ?? []);
      if (payload.images?.length) await replaceProductImages(product.id, payload.images);
      return product;
    } catch (error) {
      if (isUniqueViolation(error)) throw new GemstoneError("A product with this slug already exists.");
      throw error;
    }
  }

  const existingSlug = await productsCol.where("slug", "==", slug).limit(1).get();
  if (!existingSlug.empty) throw new GemstoneError("A product with this slug already exists.");

  const ref = productsCol.doc();
  await ref.set({
    categoryId: payload.categoryId,
    name,
    slug,
    shortDescription: capText(payload.shortDescription, 300),
    description: capText(payload.description, 4000),
    benefits: capText(payload.benefits, 2000),
    whoShouldWear: capText(payload.whoShouldWear, 1000),
    recommendedZodiac: capText(payload.recommendedZodiac, 200),
    recommendedPlanets: capText(payload.recommendedPlanets, 200),
    origin: capText(payload.origin, 200),
    color: capText(payload.color, 100),
    treatment: capText(payload.treatment, 200),
    certification: capText(payload.certification, 200),
    certificateUrl: capText(payload.certificateUrl, 500),
    currency: "INR",
    sku,
    featured: payload.featured ?? false,
    trending: payload.trending ?? false,
    bestseller: payload.bestseller ?? false,
    active: payload.active ?? true,
    metaTitle: capText(payload.metaTitle, 200),
    metaDescription: capText(payload.metaDescription, 300),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await replaceProductVariants(ref.id, payload.variants ?? []);
  if (payload.images?.length) await replaceProductImages(ref.id, payload.images);

  const created = await ref.get();
  return fromProductDoc(created);
}

export async function updateProduct(id: string, payload: ProductPayload) {
  if (isSupabaseCutoverActive()) {
    if (payload.variants) validateVariants(payload.variants);
    if (payload.images) validateImages(payload.images);
    const current = await getProductForAdminInSupabase(id);
    if (!current) throw new GemstoneError("Product not found.");

    let nextSlug = current.slug;
    if (payload.slug?.trim()) {
      nextSlug = toSlug(payload.slug);
      if (await productSlugTakenInSupabase(nextSlug, id)) throw new GemstoneError("A product with this slug already exists.");
    }

    try {
      const product = await updateProductInSupabase(id, {
        categoryId: payload.categoryId ?? current.categoryId,
        name: payload.name?.trim().slice(0, 200) || current.name,
        slug: nextSlug,
        shortDescription: payload.shortDescription !== undefined ? capText(payload.shortDescription, 300) : current.shortDescription,
        description: payload.description !== undefined ? capText(payload.description, 4000) : current.description,
        benefits: payload.benefits !== undefined ? capText(payload.benefits, 2000) : current.benefits,
        whoShouldWear: payload.whoShouldWear !== undefined ? capText(payload.whoShouldWear, 1000) : current.whoShouldWear,
        recommendedZodiac: payload.recommendedZodiac !== undefined ? capText(payload.recommendedZodiac, 200) : current.recommendedZodiac,
        recommendedPlanets: payload.recommendedPlanets !== undefined ? capText(payload.recommendedPlanets, 200) : current.recommendedPlanets,
        origin: payload.origin !== undefined ? capText(payload.origin, 200) : current.origin,
        color: payload.color !== undefined ? capText(payload.color, 100) : current.color,
        treatment: payload.treatment !== undefined ? capText(payload.treatment, 200) : current.treatment,
        certification: payload.certification !== undefined ? capText(payload.certification, 200) : current.certification,
        certificateUrl: payload.certificateUrl !== undefined ? capText(payload.certificateUrl, 500) : (current.certificateUrl ?? ""),
        sku: payload.sku?.trim() || current.sku,
        featured: payload.featured ?? current.featured,
        trending: payload.trending ?? current.trending,
        bestseller: payload.bestseller ?? current.bestseller,
        active: payload.active ?? current.active,
        metaTitle: payload.metaTitle !== undefined ? capText(payload.metaTitle, 200) : current.metaTitle,
        metaDescription: payload.metaDescription !== undefined ? capText(payload.metaDescription, 300) : current.metaDescription,
      });
      const wishlistTrigger = payload.variants ? await replaceProductVariants(id, payload.variants) : null;
      if (payload.images) await replaceProductImages(id, payload.images);
      return { product: product ?? current, wishlistTrigger };
    } catch (error) {
      if (isUniqueViolation(error)) throw new GemstoneError("A product with this slug already exists.");
      throw error;
    }
  }

  const ref = productsCol.doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new GemstoneError("Product not found.");
  const existing = fromProductDoc(snap);
  if (payload.variants) validateVariants(payload.variants);
  if (payload.images) validateImages(payload.images);

  let slug = existing.slug;
  if (payload.slug?.trim()) {
    slug = toSlug(payload.slug);
    const existingSlug = await productsCol.where("slug", "==", slug).limit(1).get();
    if (!existingSlug.empty && existingSlug.docs[0].id !== id) throw new GemstoneError("A product with this slug already exists.");
  }

  await ref.update({
    categoryId: payload.categoryId ?? existing.categoryId,
    name: payload.name?.trim().slice(0, 200) || existing.name,
    slug,
    shortDescription: payload.shortDescription !== undefined ? capText(payload.shortDescription, 300) : existing.shortDescription,
    description: payload.description !== undefined ? capText(payload.description, 4000) : existing.description,
    benefits: payload.benefits !== undefined ? capText(payload.benefits, 2000) : existing.benefits,
    whoShouldWear: payload.whoShouldWear !== undefined ? capText(payload.whoShouldWear, 1000) : existing.whoShouldWear,
    recommendedZodiac: payload.recommendedZodiac !== undefined ? capText(payload.recommendedZodiac, 200) : existing.recommendedZodiac,
    recommendedPlanets: payload.recommendedPlanets !== undefined ? capText(payload.recommendedPlanets, 200) : existing.recommendedPlanets,
    origin: payload.origin !== undefined ? capText(payload.origin, 200) : existing.origin,
    color: payload.color !== undefined ? capText(payload.color, 100) : existing.color,
    treatment: payload.treatment !== undefined ? capText(payload.treatment, 200) : existing.treatment,
    certification: payload.certification !== undefined ? capText(payload.certification, 200) : existing.certification,
    certificateUrl: payload.certificateUrl !== undefined ? capText(payload.certificateUrl, 500) : (existing.certificateUrl ?? ""),
    sku: payload.sku?.trim() || existing.sku,
    featured: payload.featured ?? existing.featured,
    trending: payload.trending ?? existing.trending,
    bestseller: payload.bestseller ?? existing.bestseller,
    active: payload.active ?? existing.active,
    metaTitle: payload.metaTitle !== undefined ? capText(payload.metaTitle, 200) : existing.metaTitle,
    metaDescription: payload.metaDescription !== undefined ? capText(payload.metaDescription, 300) : existing.metaDescription,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const wishlistTrigger = payload.variants ? await replaceProductVariants(id, payload.variants) : null;
  if (payload.images) await replaceProductImages(id, payload.images);

  const updated = await ref.get();
  return { product: fromProductDoc(updated), wishlistTrigger };
}

export async function duplicateProduct(id: string) {
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
    certificateUrl: product.certificateUrl ?? "",
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

export async function deleteProduct(id: string) {
  if (isSupabaseCutoverActive()) {
    // gemstone_order_items.product_id is not a foreign key, so nothing stops the
    // delete at the database level — this check is the only thing standing between
    // an admin click and orphaned order lines.
    if (await productHasOrderItemsInSupabase(id)) {
      throw new GemstoneError("This product has existing orders and cannot be deleted. Archive it instead.");
    }
    await deleteProductInSupabase(id);
    return;
  }

  // Collection-group lookup — requires a Firestore collection-group index on "items.productId" (see firestore.indexes.json).
  // This check gates a destructive action, so a missing/still-building index must fail closed
  // (block the delete) rather than silently treating the lookup as "no orders reference it".
  let referenced;
  try {
    referenced = await db.collectionGroup("items").where("productId", "==", id).limit(1).get();
  } catch (error) {
    console.error("deleteProduct order-reference check failed (likely a missing Firestore index)", error);
    throw new GemstoneError("Could not verify this product has no existing orders. Try again shortly.");
  }
  if (!referenced.empty) throw new GemstoneError("This product has existing orders and cannot be deleted. Archive it instead.");

  const [imagesSnap, variantsSnap] = await Promise.all([imagesCol(id).get(), variantsCol(id).get()]);
  const batch = db.batch();
  imagesSnap.docs.forEach((doc) => batch.delete(doc.ref));
  variantsSnap.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(productsCol.doc(id));
  await batch.commit();
}

/* ---------------------------------- public catalog ---------------------------------- */

export type ProductListItem = {
  id: string;
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
  defaultVariantId: string | null;
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

type CatalogRow = { product: GemstoneProduct; categoryName: string; categorySlug: string };

function groupByProductId<T extends { productId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.productId) ?? [];
    list.push(row);
    grouped.set(row.productId, list);
  }
  return grouped;
}

/** Fetches variants/images/ratings per product directly from their subcollections (no collection-group
 * query needed) and assembles the storefront card shape. Review ratings are pulled via a top-level
 * `gemstoneReviews` query chunked to respect Firestore's 30-item `in` limit. */
async function decorateProducts(products: CatalogRow[]): Promise<ProductListItem[]> {
  if (!products.length) return [];
  const ids = products.map((row) => row.product.id);

  let variantsByProduct: Map<string, GemstoneProductVariant[]>;
  let imagesByProduct: Map<string, GemstoneProductImage[]>;
  let ratingByProduct: Map<string, { sum: number; count: number }>;

  if (isSupabaseCutoverActive()) {
    // Three queries for the whole page instead of two per product. Ratings are
    // summed in SQL rather than pulled row by row.
    const [variants, images, ratings] = await Promise.all([
      getActiveVariantsInSupabase(ids),
      getImagesInSupabase(ids),
      getPublishedRatingTotalsInSupabase(ids),
    ]);
    variantsByProduct = groupByProductId(variants);
    imagesByProduct = groupByProductId(images);
    ratingByProduct = ratings;
  } else {
    const [variantSnaps, imageSnaps, reviewChunkSnaps] = await Promise.all([
      Promise.all(ids.map((id) => variantsCol(id).where("active", "==", true).get())),
      Promise.all(ids.map((id) => imagesCol(id).orderBy("sortOrder", "asc").get())),
      Promise.all(chunk(ids, 30).map((batch) => reviewsCol.where("productId", "in", batch).where("status", "==", "published").get())),
    ]);

    variantsByProduct = new Map(ids.map((id, index) => [id, variantSnaps[index].docs.map(fromVariantDoc)]));
    imagesByProduct = new Map(ids.map((id, index) => [id, imageSnaps[index].docs.map(fromImageDoc)]));

    ratingByProduct = new Map<string, { sum: number; count: number }>();
    for (const reviewSnap of reviewChunkSnaps) {
      for (const doc of reviewSnap.docs) {
        const data = doc.data() as { productId: string; rating: number };
        const current = ratingByProduct.get(data.productId) ?? { sum: 0, count: 0 };
        ratingByProduct.set(data.productId, { sum: current.sum + data.rating, count: current.count + 1 });
      }
    }
  }

  return products.map((row) => {
    const productVariants = variantsByProduct.get(row.product.id) ?? [];
    const images = imagesByProduct.get(row.product.id) ?? [];
    const primaryImage = images.find((image) => image.isPrimary) ?? images[0] ?? null;
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
      primaryImageUrl: primaryImage?.url ?? null,
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

/** Fetches every active product (a boutique catalog — expected to stay in the hundreds, not millions)
 * and applies category/search/price/zodiac/planet filtering + sorting in JS, exactly mirroring the
 * previous SQL behaviour. This avoids needing a large matrix of Firestore composite indexes for every
 * optional filter combination. */
export async function getProductCatalog(filters: ProductFilters = {}): Promise<{ items: ProductListItem[]; total: number; page: number; pageSize: number }> {
  let rows: CatalogRow[];
  if (isSupabaseCutoverActive()) {
    // Seeding writes the demo catalog into Firestore. Under cutover the catalog was
    // copied wholesale, so seeding would only create rows nothing reads any more.
    // The category join comes with the rows, so no second query is needed.
    rows = await getActiveCatalogRowsInSupabase();
  } else {
    await seedGemstoneCatalog();

    const [productSnap, categorySnap] = await Promise.all([productsCol.where("active", "==", true).get(), categoriesCol.get()]);
    const categoryById = new Map(categorySnap.docs.map((doc) => [doc.id, fromCategoryDoc(doc)]));

    rows = productSnap.docs.map((doc) => {
      const product = fromProductDoc(doc);
      const category = categoryById.get(product.categoryId);
      return { product, categoryName: category?.name ?? "Uncategorized", categorySlug: category?.slug ?? "" };
    });
  }

  if (filters.category) rows = rows.filter((row) => row.categorySlug === filters.category);
  if (filters.featured) rows = rows.filter((row) => row.product.featured);
  if (filters.trending) rows = rows.filter((row) => row.product.trending);
  if (filters.bestseller) rows = rows.filter((row) => row.product.bestseller);
  if (filters.certification) {
    const needle = filters.certification.toLowerCase();
    rows = rows.filter((row) => row.product.certification.toLowerCase().includes(needle));
  }
  if (filters.zodiac) {
    const needle = filters.zodiac.toLowerCase();
    rows = rows.filter((row) => row.product.recommendedZodiac.toLowerCase().includes(needle));
  }
  if (filters.planet) {
    const needle = filters.planet.toLowerCase();
    rows = rows.filter((row) => row.product.recommendedPlanets.toLowerCase().includes(needle));
  }
  if (filters.search?.trim()) {
    const needle = filters.search.trim().toLowerCase();
    rows = rows.filter((row) =>
      row.product.name.toLowerCase().includes(needle) ||
      row.product.shortDescription.toLowerCase().includes(needle) ||
      row.product.recommendedZodiac.toLowerCase().includes(needle) ||
      row.product.recommendedPlanets.toLowerCase().includes(needle));
  }

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
  if (isSupabaseCutoverActive()) {
    const row = await getCatalogRowBySlugInSupabase(slug);
    if (!row || !row.product.active) return null;

    const [images, variants, ratings] = await Promise.all([
      getImagesInSupabase([row.product.id]),
      getActiveVariantsInSupabase([row.product.id]),
      getPublishedRatingTotalsInSupabase([row.product.id]),
    ]);
    const rating = ratings.get(row.product.id);
    return {
      ...row.product,
      categoryName: row.categoryName,
      categorySlug: row.categorySlug,
      images,
      // Already price-ordered by the query; sorted again so both providers return
      // the same order regardless of how the rows arrived.
      variants: [...variants].sort((a, b) => a.price - b.price),
      ratingAverage: rating ? Math.round((rating.sum / rating.count) * 10) / 10 : 0,
      ratingCount: rating?.count ?? 0,
    };
  }

  await seedGemstoneCatalog();
  const snap = await productsCol.where("slug", "==", slug).limit(1).get();
  if (snap.empty) return null;
  const product = fromProductDoc(snap.docs[0]);
  if (!product.active) return null;

  const categoryDoc = await categoriesCol.doc(product.categoryId).get();
  const category = categoryDoc.exists ? fromCategoryDoc(categoryDoc) : null;

  const [imagesSnap, variantsSnap, reviewsSnap] = await Promise.all([
    imagesCol(product.id).orderBy("sortOrder", "asc").get(),
    variantsCol(product.id).where("active", "==", true).get(),
    reviewsCol.where("productId", "==", product.id).where("status", "==", "published").get(),
  ]);

  const variants = variantsSnap.docs.map(fromVariantDoc).sort((a, b) => a.price - b.price);
  const ratings = reviewsSnap.docs.map((doc) => (doc.data() as { rating: number }).rating);
  const ratingAverage = ratings.length ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10 : 0;

  return {
    ...product,
    categoryName: category?.name ?? "Uncategorized",
    categorySlug: category?.slug ?? "",
    images: imagesSnap.docs.map(fromImageDoc),
    variants,
    ratingAverage,
    ratingCount: ratings.length,
  };
}

export async function getRelatedProducts(categoryId: string, excludeProductId: string, limit = 4): Promise<ProductListItem[]> {
  if (isSupabaseCutoverActive()) {
    return decorateProducts(await getRelatedCatalogRowsInSupabase(categoryId, excludeProductId, limit));
  }

  const snap = await productsCol.where("categoryId", "==", categoryId).where("active", "==", true).limit(limit + 1).get();
  const categoryDoc = await categoriesCol.doc(categoryId).get();
  const category = categoryDoc.exists ? fromCategoryDoc(categoryDoc) : null;

  const rows: CatalogRow[] = snap.docs
    .map(fromProductDoc)
    .filter((product) => product.id !== excludeProductId)
    .slice(0, limit)
    .map((product) => ({ product, categoryName: category?.name ?? "Uncategorized", categorySlug: category?.slug ?? "" }));
  return decorateProducts(rows);
}

export async function getProductsByIds(ids: string[]): Promise<ProductListItem[]> {
  if (!ids.length) return [];
  if (isSupabaseCutoverActive()) return decorateProducts((await getCatalogRowsByIdsInSupabase(ids)).filter((row) => row.product.active));
  const snaps = await db.getAll(...ids.map((id) => productsCol.doc(id)));
  const products = snaps.filter((snap) => snap.exists).map((snap) => fromProductDoc(snap)).filter((product) => product.active);

  const categoryIds = [...new Set(products.map((product) => product.categoryId))];
  const categorySnaps = categoryIds.length ? await db.getAll(...categoryIds.map((id) => categoriesCol.doc(id))) : [];
  const categoryById = new Map(categorySnaps.map((snap) => [snap.id, snap.exists ? fromCategoryDoc(snap) : null]));

  const rows: CatalogRow[] = products.map((product) => {
    const category = categoryById.get(product.categoryId);
    return { product, categoryName: category?.name ?? "Uncategorized", categorySlug: category?.slug ?? "" };
  });
  return decorateProducts(rows);
}

export async function getAllActiveProductSlugs() {
  if (isSupabaseCutoverActive()) return getActiveProductSlugsInSupabase();
  const snap = await productsCol.where("active", "==", true).get();
  return snap.docs.map((doc) => {
    const data = doc.data() as { slug: string; updatedAt?: Timestamp };
    return { slug: data.slug, updatedAt: toDate(data.updatedAt) };
  });
}

export async function getProductsBySlugs(slugs: string[]): Promise<ProductListItem[]> {
  if (!slugs.length) return [];
  if (isSupabaseCutoverActive()) {
    // One `= any(...)` query replaces the Firestore path's chunked `in` queries,
    // and the result is re-ordered by the caller's slug list below so the page
    // keeps the order it asked for.
    const supabaseRows = (await getCatalogRowsBySlugsInSupabase(slugs)).filter((row) => row.product.active);
    const decorated = await decorateProducts(supabaseRows);
    const bySlug = new Map(decorated.map((item) => [item.slug, item]));
    return slugs.map((slug) => bySlug.get(slug)).filter((item): item is ProductListItem => Boolean(item));
  }
  const snaps = await Promise.all(chunk(slugs, 30).map((batch) => productsCol.where("slug", "in", batch).get()));
  const products = snaps.flatMap((snap) => snap.docs.map(fromProductDoc)).filter((product) => product.active);

  const categoryIds = [...new Set(products.map((product) => product.categoryId))];
  const categorySnaps = categoryIds.length ? await db.getAll(...categoryIds.map((id) => categoriesCol.doc(id))) : [];
  const categoryById = new Map(categorySnaps.map((snap) => [snap.id, snap.exists ? fromCategoryDoc(snap) : null]));

  const rows: CatalogRow[] = products.map((product) => {
    const category = categoryById.get(product.categoryId);
    return { product, categoryName: category?.name ?? "Uncategorized", categorySlug: category?.slug ?? "" };
  });
  const decorated = await decorateProducts(rows);
  const bySlug = new Map(decorated.map((item) => [item.slug, item]));
  return slugs.map((slug) => bySlug.get(slug)).filter((item): item is ProductListItem => Boolean(item));
}
