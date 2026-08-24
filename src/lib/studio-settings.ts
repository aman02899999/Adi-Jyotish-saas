import "server-only";

import { unstable_cache } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

export type StudioSettings = {
  studioName: string;
  supportEmail: string;
  timezone: string;
  currency: string;
  cancellationHours: number;
  bookingLeadMinutes: number;
  replySlaHours: number;
  gstRate: number;
  gstin: string | null;
  // ISO string, not a Date — same fix as promo-banner.ts's PromoBanner.updatedAt: unstable_cache
  // persists its return value through a serialization round-trip, so a cache-hit silently hands
  // back a plain string where a cache-miss would have handed back a real Date under the same field
  // name. Storing the string form up front keeps the type honest regardless of cache state.
  updatedAt: string;
};

const defaults: Omit<StudioSettings, "updatedAt"> = {
  studioName: "Adi Jyotish Guru",
  supportEmail: "support@adijyotishguru.com",
  timezone: "Asia/Kolkata",
  currency: "INR",
  cancellationHours: 24,
  bookingLeadMinutes: 15,
  replySlaHours: 24,
  gstRate: 18,
  gstin: null,
};

const ref = db.collection("studioSettings").doc("main");

async function fetchStudioSettings(): Promise<StudioSettings> {
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ ...defaults, updatedAt: FieldValue.serverTimestamp() });
    return { ...defaults, updatedAt: new Date().toISOString() };
  }
  const data = snap.data() as Partial<Omit<StudioSettings, "updatedAt">> & { updatedAt?: FirebaseFirestore.Timestamp };
  return { ...defaults, ...data, updatedAt: (data.updatedAt?.toDate() ?? new Date()).toISOString() };
}

/** Falls back to defaults instead of throwing — both so a transient Firestore hiccup degrades one
 * section instead of 500ing an entire marketing page (same philosophy as withIndexFallback in
 * firestore.ts), and so pages using this can be statically/ISR-prerendered: `next build` has no
 * Firebase credentials (CI has none at all; this app's deploy config only grants them at runtime),
 * so the very first call here happens with no credentials and must not crash the build. */
async function fetchStudioSettingsSafely(): Promise<StudioSettings> {
  try {
    return await fetchStudioSettings();
  } catch (error) {
    console.error("getStudioSettings: falling back to defaults —", error);
    return { ...defaults, updatedAt: new Date().toISOString() };
  }
}

// Same content for every visitor (not personalized), read on nearly every page via SiteFooter —
// without this, that's a real Firestore round-trip on every single request. unstable_cache keeps
// this cached at runtime with a 5-minute TTL. An admin save reads back fresh (below); other
// visitors may see the previous version for up to the revalidate window.
export const getStudioSettings = unstable_cache(fetchStudioSettingsSafely, ["studio-settings"], {
  tags: ["studio-settings"],
  revalidate: 300,
});

export async function updateStudioSettings(patch: Partial<StudioSettings>) {
  await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return fetchStudioSettings();
}
