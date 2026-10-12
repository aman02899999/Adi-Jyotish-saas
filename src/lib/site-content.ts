import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { db, isMissingFirebaseProjectError } from "@/lib/firestore";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { getSiteContentInSupabase, mergeSiteContentInSupabase } from "@/lib/cms-supabase";

export type HomeHeroContent = {
  eyebrow: string;
  headline: string;
  headlineEm: string;
  lead: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
};

export type FooterContent = {
  blurb: string;
};

const DEFAULT_HERO: HomeHeroContent = {
  eyebrow: "Ancient clarity, beautifully modern",
  headline: "Your stars.",
  headlineEm: "Your story.",
  lead: "Authentic Vedic astrology translated into thoughtful, personal guidance for the life you are living now.",
  primaryCtaLabel: "Explore your chart",
  primaryCtaHref: "/dashboard",
  secondaryCtaLabel: "How it works",
  secondaryCtaHref: "#method",
};

const DEFAULT_FOOTER: FooterContent = {
  blurb: "Ancient wisdom for modern life.\nMade thoughtfully in the present.",
};

const collection = db.collection("siteContent");

/** Only a same-site relative path or an https:// URL is allowed — rendered unescaped as a <Link
 * href> on the homepage (src/app/page.tsx), so a javascript:/data: URI here would be a stored-XSS
 * vector triggered just by clicking the hero CTA. Same guard already applied to the promo banner's
 * CTA link (src/app/api/admin/promo-banner/route.ts). */
function isSafeCtaHref(href: string) {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    return new URL(href).protocol === "https:";
  } catch {
    return false;
  }
}

async function readContent<T>(id: string): Promise<Partial<T> | null> {
  if (isSupabaseCutoverActive()) return (await getSiteContentInSupabase(id)) as Partial<T> | null;
  const doc = await collection.doc(id).get();
  return doc.exists ? (doc.data() as Partial<T>) : null;
}

/** Merges into the stored document; updatedAt is Firestore-only (the row has its own updated_at). */
async function writeContent(id: string, update: Record<string, unknown>) {
  if (isSupabaseCutoverActive()) {
    const { updatedAt: _updatedAt, ...fields } = update;
    await mergeSiteContentInSupabase(id, fields);
    return;
  }
  await collection.doc(id).set(update, { merge: true });
}

const CTA_HREF_FIELDS = new Set<keyof HomeHeroContent>(["primaryCtaHref", "secondaryCtaHref"]);

/** Every field falls back to the current hardcoded copy if the admin has never edited it, so a
 * fresh deploy (or a doc that only has some fields set) renders identically to before this
 * system existed — nothing on the homepage can go blank from a missing Firestore doc.
 *
 * A *read failure* is different from a missing field and deliberately throws out of here, so the
 * cache below never stores the defaults as though they were the saved copy. getHomeHeroContent
 * does that degrading, outside the cache. */
async function fetchHomeHeroContent(): Promise<HomeHeroContent> {
  const data = await readContent<HomeHeroContent>("home-hero");
  if (!data) return DEFAULT_HERO;
  // Only pull the fields HomeHeroContent actually declares — the doc also carries an
  // updatedAt Firestore Timestamp (see updateHomeHeroContent) that has no place leaking into
  // this plain content object.
  const result = { ...DEFAULT_HERO };
  for (const key of Object.keys(DEFAULT_HERO) as (keyof HomeHeroContent)[]) {
    const value = data[key];
    if (typeof value === "string" && value !== "") result[key] = value;
  }
  return result;
}

// Same content for every visitor — cached at runtime (not build time, so no Firebase credentials
// needed during `next build`) rather than read fresh from Firestore on every single homepage hit.
// An admin save expires the tag below, so an edit is live immediately rather than after the TTL.
const getHomeHeroContentCached = unstable_cache(fetchHomeHeroContent, ["home-hero-content"], {
  tags: ["home-hero-content"],
  revalidate: 300,
});

/**
 * The degrade-to-defaults step sits outside the cache on purpose, and the predicate is the same
 * broad one withFirebaseFallback used — a spent quota or an unreachable backend still renders the
 * built-in copy rather than 500ing the homepage. What changed is that the fallback is no longer
 * produced *inside* the cached callback, where it was an ordinary resolved value that
 * unstable_cache stored and replayed for the rest of the 300s window.
 *
 * That mattered beyond the homepage looking wrong: the admin editor seeds its form from this read
 * and PUTs every field back (see AdminWebsiteContent), so an admin who opened /admin/website
 * during that window saw the defaults and could save them straight over real copy. Admin reads
 * now go through getHomeHeroContentForAdmin, which never substitutes defaults for a failure.
 */
export async function getHomeHeroContent(): Promise<HomeHeroContent> {
  try {
    return await getHomeHeroContentCached();
  } catch (error) {
    if (!isMissingFirebaseProjectError(error)) throw error;
    console.warn("getHomeHeroContent: Firebase unavailable; using fallback.", error);
    return DEFAULT_HERO;
  }
}

/** Uncached and never falls back: a read failure must reach the admin as an error, because
 * whatever this returns is what the editor will write back. */
export async function getHomeHeroContentForAdmin(): Promise<HomeHeroContent> {
  return fetchHomeHeroContent();
}

export async function updateHomeHeroContent(patch: Partial<HomeHeroContent>): Promise<HomeHeroContent> {
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const [key, rawValue] of Object.entries(patch) as [keyof HomeHeroContent, string][]) {
    if (typeof rawValue !== "string") continue;
    const value = rawValue.trim().slice(0, 400);
    if (CTA_HREF_FIELDS.has(key) && value && !isSafeCtaHref(value)) continue;
    update[key] = value;
  }
  await writeContent("home-hero", update);
  revalidateTag("home-hero-content", { expire: 0 });
  return fetchHomeHeroContent();
}

/** Throws on a read failure, for the same reason as fetchHomeHeroContent above. */
async function fetchFooterContent(): Promise<FooterContent> {
  const data = await readContent<FooterContent>("footer");
  if (!data) return DEFAULT_FOOTER;
  return { ...DEFAULT_FOOTER, ...(data.blurb ? { blurb: data.blurb } : {}) };
}

// Rendered via SiteFooter on nearly every page — same rationale as getHomeHeroContent above.
const getFooterContentCached = unstable_cache(fetchFooterContent, ["footer-content"], {
  tags: ["footer-content"],
  revalidate: 300,
});

/** Catch outside the cache — see getHomeHeroContent. This one reaches further: SiteFooter pulls it
 * on nearly every page, so a cached fallback replaced the footer blurb site-wide. */
export async function getFooterContent(): Promise<FooterContent> {
  try {
    return await getFooterContentCached();
  } catch (error) {
    if (!isMissingFirebaseProjectError(error)) throw error;
    console.warn("getFooterContent: Firebase unavailable; using fallback.", error);
    return DEFAULT_FOOTER;
  }
}

/** Uncached and never falls back — see getHomeHeroContentForAdmin. */
export async function getFooterContentForAdmin(): Promise<FooterContent> {
  return fetchFooterContent();
}

export async function updateFooterContent(patch: Partial<FooterContent>): Promise<FooterContent> {
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof patch.blurb === "string") update.blurb = patch.blurb.trim().slice(0, 400);
  await writeContent("footer", update);
  revalidateTag("footer-content", { expire: 0 });
  return fetchFooterContent();
}
