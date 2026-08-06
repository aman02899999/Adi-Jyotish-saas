import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db, withIndexFallback } from "@/lib/firestore";

/** Radical transparency as a differentiator: no other platform logs what a practitioner actually
 * predicted and later verifies whether it came true. A member logs a prediction against a completed
 * booking; once the expected-by date passes, the member is prompted (on their own next visit — no
 * cron) to mark the outcome. Once a practitioner has enough resolved predictions to not be skewed by
 * one early lucky or unlucky call, their accuracy rate is surfaced on their public profile. */

export class PredictionError extends Error {}

export const MIN_RESOLVED_FOR_PUBLIC_STAT = 5;

export type PredictionStatus = "pending" | "came_true" | "did_not_happen" | "unclear";

export type Prediction = {
  id: string;
  memberId: string;
  memberName: string;
  practitionerId: string;
  practitionerName: string;
  bookingId: string;
  serviceTitle: string;
  text: string;
  expectedByDate: string;
  status: PredictionStatus;
  createdAt: Date;
  resolvedAt: Date | null;
};

function fromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): Prediction {
  const data = doc.data()!;
  return {
    id: doc.id,
    memberId: data.memberId,
    memberName: data.memberName,
    practitionerId: data.practitionerId,
    practitionerName: data.practitionerName,
    bookingId: data.bookingId,
    serviceTitle: data.serviceTitle,
    text: data.text,
    expectedByDate: data.expectedByDate,
    status: data.status,
    createdAt: (data.createdAt as FirebaseFirestore.Timestamp)?.toDate() ?? new Date(),
    resolvedAt: (data.resolvedAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? null,
  };
}

export async function createPrediction({ memberId, memberName, practitionerId, practitionerName, bookingId, serviceTitle, text, expectedByDate }: {
  memberId: string;
  memberName: string;
  practitionerId: string;
  practitionerName: string;
  bookingId: string;
  serviceTitle: string;
  text: string;
  expectedByDate: string;
}): Promise<Prediction> {
  const cleanText = text.trim();
  if (cleanText.length < 10) throw new PredictionError("Please describe the prediction in a bit more detail.");
  if (cleanText.length > 600) throw new PredictionError("Please keep the prediction under 600 characters.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedByDate)) throw new PredictionError("Please choose a valid expected-by date.");

  const ref = await db.collection("predictions").add({
    memberId,
    memberName,
    practitionerId,
    practitionerName,
    bookingId,
    serviceTitle,
    text: cleanText,
    expectedByDate,
    status: "pending" satisfies PredictionStatus,
    createdAt: FieldValue.serverTimestamp(),
    resolvedAt: null,
  });
  const saved = await ref.get();
  return fromDoc(saved);
}

export async function listMemberPredictions(memberId: string): Promise<Prediction[]> {
  const snap = await withIndexFallback(
    () => db.collection("predictions").where("memberId", "==", memberId).orderBy("createdAt", "desc").get(),
    { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as FirebaseFirestore.QuerySnapshot,
  );
  return snap.docs.map(fromDoc);
}

export async function resolvePrediction({ memberId, predictionId, status }: { memberId: string; predictionId: string; status: Exclude<PredictionStatus, "pending"> }): Promise<Prediction> {
  const ref = db.collection("predictions").doc(predictionId);
  const snap = await ref.get();
  if (!snap.exists) throw new PredictionError("Prediction not found.");
  const current = fromDoc(snap);
  if (current.memberId !== memberId) throw new PredictionError("Prediction not found.");
  if (current.status !== "pending") throw new PredictionError("This prediction has already been resolved.");

  await ref.update({ status, resolvedAt: FieldValue.serverTimestamp() });
  const updated = await ref.get();
  return fromDoc(updated);
}

/** Global scan, grouped in application code rather than queried per-practitioner — mirrors how
 * practitioner reviews are aggregated (see getMarketplacePractitioners), and keeps this to the one
 * automatically-indexed single-field orderBy rather than adding another composite index. */
export async function getPractitionerAccuracyMap(): Promise<Map<string, { accuracyPercent: number; resolvedCount: number }>> {
  const snap = await db.collection("predictions").orderBy("createdAt", "desc").get();
  const byPractitioner = new Map<string, { resolved: number; accurate: number }>();
  for (const doc of snap.docs) {
    const data = doc.data();
    const status = data.status as PredictionStatus;
    if (status !== "came_true" && status !== "did_not_happen") continue;
    const practitionerId = data.practitionerId as string;
    const entry = byPractitioner.get(practitionerId) ?? { resolved: 0, accurate: 0 };
    entry.resolved += 1;
    if (status === "came_true") entry.accurate += 1;
    byPractitioner.set(practitionerId, entry);
  }

  const result = new Map<string, { accuracyPercent: number; resolvedCount: number }>();
  for (const [practitionerId, { resolved, accurate }] of byPractitioner) {
    if (resolved < MIN_RESOLVED_FOR_PUBLIC_STAT) continue;
    result.set(practitionerId, { accuracyPercent: Math.round((accurate / resolved) * 100), resolvedCount: resolved });
  }
  return result;
}
