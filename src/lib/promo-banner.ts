import "server-only";

import { unstable_cache } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

export type PromoBanner = {
  enabled: boolean;
  message: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  // "manual" once an admin has ever saved the banner through the admin UI — the festival
  // auto-scheduler (see lifecycle-automation.ts) treats that as a permanent opt-out and never
  // touches the banner again, even to turn it off. "auto" (or unset) means the automation still
  // owns it. festivalKey tracks which festival the automation currently has live, so it knows
  // exactly when to turn itself back off.
  source: "manual" | "auto";
  festivalKey: string | null;
  // ISO string, not a Date — unstable_cache persists its return value through a serialization
  // round-trip, so a cache-hit silently hands back a plain string where a cache-miss would have
  // handed back a real Date with the same field name. Storing the string form up front (instead of
  // converting at each of the two API routes that used to call .toISOString() on this) makes the
  // type honest regardless of cache state — that mismatch is exactly what caused a live production
  // TypeError ("e.updatedAt.toISOString is not a function") on cache hits.
  updatedAt: string;
};

const defaults: Omit<PromoBanner, "updatedAt"> = {
  enabled: false,
  message: "",
  ctaLabel: null,
  ctaHref: null,
  source: "auto",
  festivalKey: null,
};

const ref = db.collection("promoBanner").doc("main");

async function fetchPromoBanner(): Promise<PromoBanner> {
  const snap = await ref.get();
  if (!snap.exists) return { ...defaults, updatedAt: new Date(0).toISOString() };
  const data = snap.data() as Partial<Omit<PromoBanner, "updatedAt">> & { updatedAt?: FirebaseFirestore.Timestamp };
  return { ...defaults, ...data, updatedAt: (data.updatedAt?.toDate() ?? new Date(0)).toISOString() };
}

// Same content for every visitor, fetched client-side by PromoBanner on nearly every page — cached
// at runtime with a short TTL instead of hitting Firestore on every single request. Falls back to
// the disabled-banner defaults (rather than a 500) if Firestore is unreachable, matching
// getStudioSettings' philosophy in studio-settings.ts.
export const getPromoBanner = unstable_cache(
  async () => {
    try {
      return await fetchPromoBanner();
    } catch (error) {
      console.error("getPromoBanner: falling back to defaults —", error);
      return { ...defaults, updatedAt: new Date(0).toISOString() };
    }
  },
  ["promo-banner"],
  { tags: ["promo-banner"], revalidate: 60 },
);

export async function updatePromoBanner(patch: Partial<Omit<PromoBanner, "updatedAt">>) {
  await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return fetchPromoBanner();
}
