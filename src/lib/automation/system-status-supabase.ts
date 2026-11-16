import "server-only";

import { query } from "@/lib/postgres";
import type { RunRecord } from "@/lib/automation/system-status";

/** One row per run on Postgres (supabase/migrations/0017_system_status.sql). */
export async function recordRunInSupabase(run: RunRecord): Promise<void> {
  await query(`insert into public.system_status (key, at, ok, mode, source, attempts, summary) values ($1, $2, $3, $4, $5, $6, $7)`, [
    run.key,
    run.at,
    run.ok,
    run.mode,
    run.source,
    run.attempts,
    run.summary,
  ]);
}

export async function latestRunsInSupabase(keys: string[]): Promise<Record<string, RunRecord | null>> {
  const { rows } = await query<{ key: string; at: Date; ok: boolean; mode: string; source: string; attempts: number; summary: string }>(
    `select distinct on (key) key, at, ok, mode, source, attempts, summary from public.system_status where key = any($1) order by key, at desc`,
    [keys],
  );
  const out: Record<string, RunRecord | null> = Object.fromEntries(keys.map((k) => [k, null]));
  for (const r of rows) out[r.key] = { key: r.key, at: new Date(r.at).toISOString(), ok: r.ok, mode: r.mode as RunRecord["mode"], source: r.source as RunRecord["source"], attempts: r.attempts, summary: r.summary };
  return out;
}

/** True when this call made the claim; false when it was already taken. */
export async function claimOnceInSupabase(id: string): Promise<boolean> {
  const { rows } = await query(`insert into public.system_status_claims (id) values ($1) on conflict (id) do nothing returning id`, [id]);
  return rows.length > 0;
}
