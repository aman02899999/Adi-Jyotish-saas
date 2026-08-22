import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

/** Deliberately small and explicit rather than a generic "register any experiment at runtime"
 * system — every experiment here is a real, specific thing wired into a real page, findable by
 * grepping this key. Add a new entry (and its variants) here before wiring it anywhere. */
const EXPERIMENTS = {
  "dashboard-onboarding-cta": {
    variants: ["control", "get-my-chart"] as const,
    description: "Dashboard first-steps CTA label — \"Complete birth profile\" (control) vs \"Get my free chart\" — conversion is completing the birth profile.",
  },
} as const;

export type ExperimentKey = keyof typeof EXPERIMENTS;

function hashToIndex(input: string, buckets: number): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  return hash % buckets;
}

/** Deterministic, cookie-free bucketing: the same bucketingId always lands in the same variant
 * for a given experiment, so this needs no client-side tracking ID, cookie, or consent banner —
 * it only works because the caller already has a stable ID for another reason (a signed-in
 * member's own account ID). This is not a general anonymous-visitor experimentation system. */
export function getVariant(key: ExperimentKey, bucketingId: string): string {
  const experiment = EXPERIMENTS[key];
  const variants: readonly string[] = experiment.variants;
  return variants[hashToIndex(`${key}:${bucketingId}`, variants.length)];
}

export async function recordExperimentImpression(key: ExperimentKey, variant: string) {
  const ref = db.collection("experiments").doc(key).collection("variants").doc(variant);
  await ref.set({ impressions: FieldValue.increment(1) }, { merge: true }).catch((error) => console.error("Experiment impression record failed", error));
}

export async function recordExperimentConversion(key: ExperimentKey, variant: string) {
  const ref = db.collection("experiments").doc(key).collection("variants").doc(variant);
  await ref.set({ conversions: FieldValue.increment(1) }, { merge: true }).catch((error) => console.error("Experiment conversion record failed", error));
}

export type ExperimentReport = {
  key: ExperimentKey;
  description: string;
  variants: { variant: string; impressions: number; conversions: number; conversionRate: number }[];
  recommendation: string;
};

const MIN_SAMPLE_FOR_RECOMMENDATION = 200;

/** Reports what's happened so far and names a leading variant when the sample looks big enough
 * to say anything — but this is read-only. Nothing in this file ever changes which variant a page
 * renders based on results; an admin (or a future deliberate code change) has to act on it. */
export async function getExperimentReport(key: ExperimentKey): Promise<ExperimentReport> {
  const experiment = EXPERIMENTS[key];
  const snap = await db.collection("experiments").doc(key).collection("variants").get();
  const byVariant = new Map(snap.docs.map((doc) => [doc.id, doc.data() as { impressions?: number; conversions?: number }]));

  const variants = experiment.variants.map((variant) => {
    const data = byVariant.get(variant);
    const impressions = data?.impressions ?? 0;
    const conversions = data?.conversions ?? 0;
    return { variant, impressions, conversions, conversionRate: impressions ? conversions / impressions : 0 };
  });

  const totalImpressions = variants.reduce((sum, entry) => sum + entry.impressions, 0);
  const leader = [...variants].sort((a, b) => b.conversionRate - a.conversionRate)[0];
  const recommendation = totalImpressions < MIN_SAMPLE_FOR_RECOMMENDATION
    ? `Not enough data yet (${totalImpressions} impressions total) for a reliable read.`
    : `"${leader.variant}" is leading at ${(leader.conversionRate * 100).toFixed(1)}% conversion. Worth considering as the new default — not applied automatically.`;

  return { key, description: experiment.description, variants, recommendation };
}

export function listExperimentKeys(): ExperimentKey[] {
  return Object.keys(EXPERIMENTS) as ExperimentKey[];
}
