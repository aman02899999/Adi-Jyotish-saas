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

export async function getStudioSettings(): Promise<StudioSettings> {
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ ...defaults, updatedAt: FieldValue.serverTimestamp() });
    return { ...defaults, updatedAt: new Date() };
  }
  const data = snap.data() as Partial<StudioSettings> & { updatedAt?: FirebaseFirestore.Timestamp };
  return { ...defaults, ...data, updatedAt: data.updatedAt?.toDate() ?? new Date() };
}

export async function updateStudioSettings(patch: Partial<StudioSettings>) {
  await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return getStudioSettings();
}
