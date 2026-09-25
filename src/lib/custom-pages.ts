import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db, withFirebaseFallback } from "@/lib/firestore";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import {
  deleteCustomPageInSupabase,
  getCustomPageInSupabase,
  insertCustomPageInSupabase,
  listCustomPagesInSupabase,
  updateCustomPageInSupabase,
  type CustomPageRow,
} from "@/lib/custom-pages-supabase";

export class CustomPageError extends Error {}

export type BlockType = "hero" | "richtext" | "imagetext" | "cta" | "faq" | "stats" | "spacer";

export type PageBlock = {
  id: string;
  type: BlockType;
  data: Record<string, string | string[]>;
};

export type CustomPage = {
  id: string;
  slug: string;
  title: string;
  metaDescription: string;
  blocks: PageBlock[];
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type CustomPageDoc = {
  slug: string;
  title: string;
  metaDescription: string;
  blocks: PageBlock[];
  published: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
};

const collection = db.collection("customPages");
const RESERVED_SLUGS = new Set(["home", "footer"]);

function toSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

function toCustomPage(doc: FirebaseFirestore.DocumentSnapshot): CustomPage {
  const data = doc.data() as CustomPageDoc;
  return {
    id: doc.id,
    slug: data.slug,
    title: data.title,
    metaDescription: data.metaDescription ?? "",
    blocks: data.blocks ?? [],
    published: data.published,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

const fromRow = (row: CustomPageRow): CustomPage => ({ ...row, blocks: row.blocks as PageBlock[] });

export async function getAllCustomPagesAdmin(): Promise<CustomPage[]> {
  if (isSupabaseCutoverActive()) return (await listCustomPagesInSupabase(false)).map(fromRow);
  const snap = await collection.orderBy("createdAt", "desc").get();
  return snap.docs.map(toCustomPage);
}

export async function getCustomPageById(id: string): Promise<CustomPage | null> {
  if (isSupabaseCutoverActive()) {
    const row = await getCustomPageInSupabase({ id });
    return row ? fromRow(row) : null;
  }
  const doc = await collection.doc(id).get();
  if (!doc.exists) return null;
  return toCustomPage(doc);
}

export async function getPublishedCustomPageBySlug(slug: string): Promise<CustomPage | null> {
  return withFirebaseFallback(async () => {
    if (isSupabaseCutoverActive()) {
      const row = await getCustomPageInSupabase({ publishedSlug: slug });
      return row ? fromRow(row) : null;
    }
    const snap = await collection.where("slug", "==", slug).where("published", "==", true).limit(1).get();
    if (snap.empty) return null;
    return toCustomPage(snap.docs[0]);
  }, null, `getPublishedCustomPageBySlug:${slug}`);
}

export async function getPublishedCustomPages(): Promise<CustomPage[]> {
  return withFirebaseFallback(async () => {
    if (isSupabaseCutoverActive()) return (await listCustomPagesInSupabase(true)).map(fromRow);
    const snap = await collection.where("published", "==", true).get();
    return snap.docs.map(toCustomPage);
  }, [], "getPublishedCustomPages");
}

export async function createCustomPage(input: { title: string; metaDescription: string }): Promise<CustomPage> {
  const title = input.title.trim().slice(0, 120);
  if (title.length < 2) throw new CustomPageError("Enter a page title.");

  const base = toSlug(title) || "page";
  const metaDescription = input.metaDescription.trim().slice(0, 300);
  if (isSupabaseCutoverActive()) {
    // The same candidates the loop below tries, in order; the unique index settles clashes.
    const candidates = [base, ...Array.from({ length: 22 }, (_, attempt) => `${base}-${attempt + 2}`)].filter((slug) => !RESERVED_SLUGS.has(slug));
    const created = await insertCustomPageInSupabase({ title, metaDescription }, candidates);
    if (!created) throw new CustomPageError("Could not generate a unique URL — try a different title.");
    return fromRow(created);
  }
  let slug = base;
  for (let attempt = 0; RESERVED_SLUGS.has(slug) || (await collection.where("slug", "==", slug).limit(1).get()).size > 0; attempt += 1) {
    slug = `${base}-${attempt + 2}`;
    if (attempt > 20) throw new CustomPageError("Could not generate a unique URL — try a different title.");
  }

  const doc: Omit<CustomPageDoc, "createdAt" | "updatedAt"> = {
    slug,
    title,
    metaDescription,
    blocks: [],
    published: false,
  };
  const ref = await collection.add({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return toCustomPage(await ref.get());
}

const MAX_BLOCKS = 40;

export async function updateCustomPage(id: string, patch: Partial<{ title: string; metaDescription: string; blocks: PageBlock[]; published: boolean }>): Promise<CustomPage> {
  const cutover = isSupabaseCutoverActive();
  const ref = collection.doc(id);
  if (!cutover && !(await ref.get()).exists) throw new CustomPageError("Page not found.");

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, 120);
    if (title.length < 2) throw new CustomPageError("Enter a page title.");
    update.title = title;
  }
  if (patch.metaDescription !== undefined) update.metaDescription = patch.metaDescription.trim().slice(0, 300);
  if (patch.blocks !== undefined) {
    if (patch.blocks.length > MAX_BLOCKS) throw new CustomPageError(`A page can have at most ${MAX_BLOCKS} blocks.`);
    update.blocks = patch.blocks;
  }
  if (patch.published !== undefined) update.published = patch.published;

  if (cutover) {
    const row = await updateCustomPageInSupabase(id, update);
    if (!row) throw new CustomPageError("Page not found.");
    return fromRow(row);
  }
  await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp() });
  return toCustomPage(await ref.get());
}

export async function deleteCustomPage(id: string) {
  if (isSupabaseCutoverActive()) {
    if (!(await deleteCustomPageInSupabase(id))) throw new CustomPageError("Page not found.");
    return;
  }
  const ref = collection.doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new CustomPageError("Page not found.");
  await ref.delete();
}
