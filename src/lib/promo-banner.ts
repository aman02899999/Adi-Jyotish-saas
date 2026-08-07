import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

export type PromoBanner = {
  enabled: boolean;
  message: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  updatedAt: Date;
};

const defaults: Omit<PromoBanner, "updatedAt"> = {
  enabled: false,
  message: "",
  ctaLabel: null,
  ctaHref: null,
};

const ref = db.collection("promoBanner").doc("main");

export async function getPromoBanner(): Promise<PromoBanner> {
  const snap = await ref.get();
  if (!snap.exists) return { ...defaults, updatedAt: new Date(0) };
  const data = snap.data() as Partial<PromoBanner> & { updatedAt?: FirebaseFirestore.Timestamp };
  return { ...defaults, ...data, updatedAt: data.updatedAt?.toDate() ?? new Date(0) };
}

export async function updatePromoBanner(patch: Partial<Omit<PromoBanner, "updatedAt">>) {
  await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return getPromoBanner();
}
