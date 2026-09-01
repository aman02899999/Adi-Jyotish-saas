import "server-only";

import { unstable_cache } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { db, withFirebaseFallback } from "@/lib/firestore";

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

const CTA_HREF_FIELDS = new Set<keyof HomeHeroContent>(["primaryCtaHref", "secondaryCtaHref"]);

/** Every field falls back to the current hardcoded copy if the admin has never edited it, so a
 * fresh deploy (or a doc that only has some fields set) renders identically to before this
 * system existed — nothing on the homepage can go blank from a missing Firestore doc. */
async function fetchHomeHeroContent(): Promise<HomeHeroContent> {
  return withFirebaseFallback(async () => {
    const doc = await collection.doc("home-hero").get();
    if (!doc.exists) return DEFAULT_HERO;
    const data = doc.data() as Partial<HomeHeroContent>;
    // Only pull the fields HomeHeroContent actually declares — the doc also carries an
    // updatedAt Firestore Timestamp (see updateHomeHeroContent) that has no place leaking into
    // this plain content object.
    const result = { ...DEFAULT_HERO };
    for (const key of Object.keys(DEFAULT_HERO) as (keyof HomeHeroContent)[]) {
      const value = data[key];
      if (typeof value === "string" && value !== "") result[key] = value;
    }
    return result;
  }, DEFAULT_HERO, "getHomeHeroContent");
}

// Same content for every visitor — cached at runtime (not build time, so no Firebase credentials
// needed during `next build`) rather than read fresh from Firestore on every single homepage hit.
// An admin save reads back fresh (see updateHomeHeroContent below); other visitors may see the
// previous version for up to the revalidate window.
export const getHomeHeroContent = unstable_cache(fetchHomeHeroContent, ["home-hero-content"], {
  tags: ["home-hero-content"],
  revalidate: 300,
});

export async function updateHomeHeroContent(patch: Partial<HomeHeroContent>): Promise<HomeHeroContent> {
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const [key, rawValue] of Object.entries(patch) as [keyof HomeHeroContent, string][]) {
    if (typeof rawValue !== "string") continue;
    const value = rawValue.trim().slice(0, 400);
    if (CTA_HREF_FIELDS.has(key) && value && !isSafeCtaHref(value)) continue;
    update[key] = value;
  }
  await collection.doc("home-hero").set(update, { merge: true });
  return fetchHomeHeroContent();
}

async function fetchFooterContent(): Promise<FooterContent> {
  return withFirebaseFallback(async () => {
    const doc = await collection.doc("footer").get();
    if (!doc.exists) return DEFAULT_FOOTER;
    const data = doc.data() as Partial<FooterContent>;
    return { ...DEFAULT_FOOTER, ...(data.blurb ? { blurb: data.blurb } : {}) };
  }, DEFAULT_FOOTER, "getFooterContent");
}

// Rendered via SiteFooter on nearly every page — same rationale as getHomeHeroContent above.
export const getFooterContent = unstable_cache(fetchFooterContent, ["footer-content"], {
  tags: ["footer-content"],
  revalidate: 300,
});

export async function updateFooterContent(patch: Partial<FooterContent>): Promise<FooterContent> {
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof patch.blurb === "string") update.blurb = patch.blurb.trim().slice(0, 400);
  await collection.doc("footer").set(update, { merge: true });
  return fetchFooterContent();
}
