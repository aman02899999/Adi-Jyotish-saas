import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db, withIndexFallback } from "@/lib/firestore";
import { getResolvedPredictionCountsInSupabase } from "@/lib/practitioners-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import {
  insertPredictionInSupabase,
  listMemberPredictionsInSupabase,
  PredictionConflict,
  resolvePredictionInSupabase,
  type PredictionRow,
} from "@/lib/predictions-supabase";

/** Radical transparency as a differentiator: no other platform logs what a practitioner actually
 * predicted and later verifies whether it came true. A member logs a prediction against a completed
 * booking; once the expected-by date passes, the member is prompted (on their own next visit — no
 * cron) to mark the outcome. Once a practitioner has enough resolved predictions to not be skewed by
 * one early lucky or unlucky call, their accuracy rate is surfaced on their public profile. */

export class PredictionError extends Error {}

export const MIN_RESOLVED_FOR_PUBLIC_STAT = 5;
const MAX_PREDICTIONS_PER_BOOKING = 5;

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

/** Postgres row -> the shape the rest of the app already consumes. */
function fromRow(row: PredictionRow): Prediction {
  return { ...row, status: row.status as PredictionStatus };
}

/**
 * Turns a database-layer conflict into the same PredictionError the Firestore path raises, so
 * callers and the route see one behaviour whichever store is underneath. Anything else is a real
 * fault and is rethrown untouched rather than being flattened into a friendly message.
 */
function translatePredictionConflict(error: unknown): unknown {
  if (!(error instanceof PredictionConflict)) return error;
  switch (error.reason) {
    case "cap":
      return new PredictionError(`You can log up to ${MAX_PREDICTIONS_PER_BOOKING} predictions per consultation.`);
    case "already_resolved":
      return new PredictionError("This prediction has already been resolved.");
    case "not_yet":
      return new PredictionError("This prediction can only be marked resolved once its expected-by date has passed.");
    case "missing":
      return new PredictionError("Prediction not found.");
  }
}

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
  if (expectedByDate <= new Date().toISOString().slice(0, 10)) throw new PredictionError("Please choose an expected-by date in the future.");

  // Bounds how many predictions one booking can ever contribute — without this, a single completed
  // booking could be used to log an unlimited number of predictions and fabricate a practitioner's
  // public accuracy stat. Wrapped in a transaction so two concurrent submissions against the same
  // booking can't both read a count under the cap and both write, exceeding it.
  if (isSupabaseCutoverActive()) {
    try {
      return fromRow(await insertPredictionInSupabase({
        memberId, memberName, practitionerId, practitionerName, bookingId, serviceTitle,
        text: cleanText, expectedByDate, maxPerBooking: MAX_PREDICTIONS_PER_BOOKING,
      }));
    } catch (error) {
      throw translatePredictionConflict(error);
    }
  }

  const ref = db.collection("predictions").doc();
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(db.collection("predictions").where("bookingId", "==", bookingId).count());
    if (existing.data().count >= MAX_PREDICTIONS_PER_BOOKING) {
      throw new PredictionError(`You can log up to ${MAX_PREDICTIONS_PER_BOOKING} predictions per consultation.`);
    }
    tx.set(ref, {
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
  });
  const saved = await ref.get();
  return fromDoc(saved);
}

export async function listMemberPredictions(memberId: string): Promise<Prediction[]> {
  if (isSupabaseCutoverActive()) {
    return (await listMemberPredictionsInSupabase(memberId)).map(fromRow);
  }
  const snap = await withIndexFallback(
    () => db.collection("predictions").where("memberId", "==", memberId).orderBy("createdAt", "desc").get(),
    { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as FirebaseFirestore.QuerySnapshot,
  );
  return snap.docs.map(fromDoc);
}

export async function resolvePrediction({ memberId, predictionId, status }: { memberId: string; predictionId: string; status: Exclude<PredictionStatus, "pending"> }): Promise<Prediction> {
  if (isSupabaseCutoverActive()) {
    try {
      return fromRow(await resolvePredictionInSupabase({
        memberId, predictionId, status, today: new Date().toISOString().slice(0, 10),
      }));
    } catch (error) {
      throw translatePredictionConflict(error);
    }
  }

  const ref = db.collection("predictions").doc(predictionId);
  // Transactional so two concurrent resolve calls on the same prediction can't both pass the
  // "still pending" check and race to write different outcomes.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new PredictionError("Prediction not found.");
    const current = fromDoc(snap);
    if (current.memberId !== memberId) throw new PredictionError("Prediction not found.");
    if (current.status !== "pending") throw new PredictionError("This prediction has already been resolved.");
    if (current.expectedByDate > new Date().toISOString().slice(0, 10)) {
      throw new PredictionError("This prediction can only be marked resolved once its expected-by date has passed.");
    }
    tx.update(ref, { status, resolvedAt: FieldValue.serverTimestamp() });
  });
  const updated = await ref.get();
  return fromDoc(updated);
}

/** Grouped in application code rather than queried per-practitioner — mirrors how practitioner
 * reviews are aggregated (see getMarketplacePractitioners). Filtered to resolved statuses only
 * (a single-field "in" filter, still covered by Firestore's automatic index, no composite needed)
 * so this doesn't grow with every still-pending prediction — only ones actually verified count. */
export async function getPractitionerAccuracyMap(): Promise<Map<string, { accuracyPercent: number; resolvedCount: number }>> {
  if (isSupabaseCutoverActive()) {
    // Same threshold and rounding as the Firestore path below — only the counts
    // come from somewhere else. Aggregating in SQL avoids pulling every resolved
    // prediction into the app to count it.
    const counts = await getResolvedPredictionCountsInSupabase();
    const aggregated = new Map<string, { accuracyPercent: number; resolvedCount: number }>();
    for (const [practitionerId, { resolved, accurate }] of counts) {
      if (resolved < MIN_RESOLVED_FOR_PUBLIC_STAT) continue;
      aggregated.set(practitionerId, { accuracyPercent: Math.round((accurate / resolved) * 100), resolvedCount: resolved });
    }
    return aggregated;
  }
  const snap = await db.collection("predictions").where("status", "in", ["came_true", "did_not_happen"]).get();
  const byPractitioner = new Map<string, { resolved: number; accurate: number }>();
  for (const doc of snap.docs) {
    const data = doc.data();
    const status = data.status as PredictionStatus;
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
