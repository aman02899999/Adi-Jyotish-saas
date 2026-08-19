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

/** Like shouldRunNow, but gates on an arbitrary string key (e.g. a "YYYY-MM" calendar month)
 * instead of a minimum time interval — for jobs that must run exactly once per period rather than
 * "at least N ms apart." A rolling interval can land twice inside the same period if the first run
 * happens early in it (e.g. a ~20-day interval firing twice within one calendar month); this
 * doesn't have that failure mode since it only compares against the last key it actually ran for. */
export async function shouldRunForKey(jobKey: string, key: string): Promise<boolean> {
  const ref = runsCollection().doc(jobKey);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lastKey = snap.exists ? (snap.data() as { lastKey?: string }).lastKey : undefined;
    if (lastKey === key) return false;
    tx.set(ref, { jobKey, lastKey: key, lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}
