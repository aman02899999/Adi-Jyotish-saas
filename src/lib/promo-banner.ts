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
  updatedAt: Date;
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
  if (!snap.exists) return { ...defaults, updatedAt: new Date(0) };
  const data = snap.data() as Partial<PromoBanner> & { updatedAt?: FirebaseFirestore.Timestamp };
  return { ...defaults, ...data, updatedAt: data.updatedAt?.toDate() ?? new Date(0) };
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
      return { ...defaults, updatedAt: new Date(0) };
    }
  },
  ["promo-banner"],
  { tags: ["promo-banner"], revalidate: 60 },
);

export async function updatePromoBanner(patch: Partial<Omit<PromoBanner, "updatedAt">>) {
  await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return fetchPromoBanner();
}
