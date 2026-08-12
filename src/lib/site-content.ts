import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

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

/** Every field falls back to the current hardcoded copy if the admin has never edited it, so a
 * fresh deploy (or a doc that only has some fields set) renders identically to before this
 * system existed — nothing on the homepage can go blank from a missing Firestore doc. */
export async function getHomeHeroContent(): Promise<HomeHeroContent> {
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
}

export async function updateHomeHeroContent(patch: Partial<HomeHeroContent>): Promise<HomeHeroContent> {
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "string") update[key] = value.trim().slice(0, 400);
  }
  await collection.doc("home-hero").set(update, { merge: true });
  return getHomeHeroContent();
}

export async function getFooterContent(): Promise<FooterContent> {
  const doc = await collection.doc("footer").get();
  if (!doc.exists) return DEFAULT_FOOTER;
  const data = doc.data() as Partial<FooterContent>;
  return { ...DEFAULT_FOOTER, ...(data.blurb ? { blurb: data.blurb } : {}) };
}

export async function updateFooterContent(patch: Partial<FooterContent>): Promise<FooterContent> {
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof patch.blurb === "string") update.blurb = patch.blurb.trim().slice(0, 400);
  await collection.doc("footer").set(update, { merge: true });
  return getFooterContent();
}
