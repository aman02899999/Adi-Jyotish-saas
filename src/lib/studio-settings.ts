import "server-only";

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
};

const defaults: StudioSettings = {
  studioName: "Jyotish Studio",
  supportEmail: "support@jyotish.studio",
  timezone: "Asia/Kolkata",
  currency: "INR",
  cancellationHours: 24,
  bookingLeadMinutes: 15,
  replySlaHours: 24,
  gstRate: 18,
  gstin: null,
};

const ref = db.collection("studioSettings").doc("main");

export async function getStudioSettings(): Promise<StudioSettings> {
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ ...defaults, updatedAt: FieldValue.serverTimestamp() });
    return defaults;
  }
  return { ...defaults, ...(snap.data() as Partial<StudioSettings>) };
}

export async function updateStudioSettings(patch: Partial<StudioSettings>) {
  await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return getStudioSettings();
}
