import "server-only";

import { db } from "@/lib/firestore";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { claimOnceInSupabase, latestRunsInSupabase, recordRunInSupabase } from "@/lib/automation/system-status-supabase";
import type { AutomationMode } from "@/lib/automation/registry";

// The site's own record of what its background jobs did. The host keeps logs for about an hour,
// so without this nobody could tell next morning whether last night's job ran. One row per run,
// plus a "latest" copy per job so the health check reads one document per job instead of a query.
// Summaries hold counts and page addresses only, never a member's details.

export type RunRecord = {
  key: string;
  at: string;
  ok: boolean;
  mode: Exclude<AutomationMode, "off">;
  source: "cron" | "retry" | "admin";
  attempts: number;
  summary: string;
};

const COLLECTION = "system_status";
const latestId = (key: string) => `latest__${key}`;

/** Never throws: a job that worked must not be reported as failed because its record couldn't be saved. */
export async function recordRun(run: RunRecord): Promise<void> {
  const row = { ...run, summary: run.summary.slice(0, 1500) };
  try {
    if (isSupabaseCutoverActive()) return await recordRunInSupabase(row);
    const batch = db.batch();
    batch.set(db.collection(COLLECTION).doc(`${row.key}__${row.at}`), row);
    batch.set(db.collection(COLLECTION).doc(latestId(row.key)), row);
    await batch.commit();
  } catch (err) {
    console.error("[system-status] record failed:", (err as Error).message);
  }
}

/** The last run of each job, or null where there is none. Throws when the database can't be read. */
export async function latestRuns(keys: string[]): Promise<Record<string, RunRecord | null>> {
  if (!keys.length) return {};
  if (isSupabaseCutoverActive()) return latestRunsInSupabase(keys);
  const snaps = await db.getAll(...keys.map((k) => db.collection(COLLECTION).doc(latestId(k))));
  return Object.fromEntries(keys.map((k, i) => [k, snaps[i].exists ? (snaps[i].data() as RunRecord) : null]));
}

/**
 * Takes a named claim exactly once (for example "alert:cron-secret-missing:2026-11-16"), so an
 * alert goes out once a day however often the check runs. True when this call took it.
 */
export async function claimOnce(id: string): Promise<boolean> {
  if (isSupabaseCutoverActive()) return claimOnceInSupabase(id);
  try {
    await db.collection(COLLECTION).doc(`claim__${id}`).create({ at: new Date().toISOString() });
    return true;
  } catch (err) {
    // ALREADY_EXISTS (gRPC code 6) is the normal "someone already took it"; anything else is a real failure.
    if ((err as { code?: number | string }).code === 6 || (err as { code?: number | string }).code === "already-exists") return false;
    throw err;
  }
}
