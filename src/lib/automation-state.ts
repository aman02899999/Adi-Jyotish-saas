import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

const runsCollection = () => db.collection("automationRuns");

/** Atomically checks whether enough time has passed since a scheduled job last ran, and if so,
 * claims the run by stamping lastRunAt before returning true. Lets daily/weekly sweeps (win-back
 * emails, practitioner digests, low-stock checks) piggyback on the existing every-15-minute
 * housekeeping cron instead of needing their own workflow + secrets, while the transactional
 * read-check-write still prevents two overlapping cron invocations from both claiming the same
 * run and duplicating a job's side effects (double-sending an email, etc). */
export async function shouldRunNow(jobKey: string, minIntervalMs: number): Promise<boolean> {
  const ref = runsCollection().doc(jobKey);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lastRunAt = snap.exists ? (snap.data() as { lastRunAt?: FirebaseFirestore.Timestamp }).lastRunAt : undefined;
    if (lastRunAt && Date.now() - lastRunAt.toMillis() < minIntervalMs) return false;
    tx.set(ref, { jobKey, lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}
