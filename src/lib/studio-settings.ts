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
  updatedAt: Date;
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
    return { ...defaults, updatedAt: new Date() };
  }
  const data = snap.data() as Partial<StudioSettings> & { updatedAt?: FirebaseFirestore.Timestamp };
  return { ...defaults, ...data, updatedAt: data.updatedAt?.toDate() ?? new Date() };
}

// Same content for every visitor (not personalized), read on nearly every page via SiteFooter —
// without this, that's a real Firestore round-trip on every single request. unstable_cache keeps
// this a runtime-only cache (nothing here runs during `next build`, so it doesn't need build-time
// Firebase credentials). An admin save reads back fresh (below); other visitors may see the
// previous version for up to the revalidate window.
export const getStudioSettings = unstable_cache(fetchStudioSettings, ["studio-settings"], {
  tags: ["studio-settings"],
  revalidate: 300,
});

export async function updateStudioSettings(patch: Partial<StudioSettings>) {
  await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return fetchStudioSettings();
}
