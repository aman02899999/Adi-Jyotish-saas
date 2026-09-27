import "server-only";

import { query } from "@/lib/postgres";

/**
 * Postgres twin for experiment counters. experiment_variants references experiments, so the
 * parent row is created on first use; the counter is incremented in place, so concurrent
 * impressions all count.
 */
export async function incrementExperimentCounterInSupabase(key: string, description: string, variant: string, counter: "impressions" | "conversions") {
  await query(`insert into public.experiments (id, description) values ($1, $2) on conflict (id) do nothing`, [key, description]);
  // Created at zero first, then incremented: an upsert naming one conflict target could lose a race
  // on the table's other unique key, (experiment_key, variant), and drop the count.
  await query(
    `insert into public.experiment_variants (id, experiment_key, variant) values ($1, $2, $3) on conflict do nothing`,
    [`${key}/${variant}`, key, variant],
  );
  await query(
    `update public.experiment_variants set ${counter} = ${counter} + 1, updated_at = now() where experiment_key = $1 and variant = $2`,
    [key, variant],
  );
}

export async function getExperimentCountsInSupabase(key: string): Promise<Map<string, { impressions: number; conversions: number }>> {
  const { rows } = await query<{ variant: string; impressions: number; conversions: number }>(
    `select variant, impressions, conversions from public.experiment_variants where experiment_key = $1`,
    [key],
  );
  return new Map(rows.map((row) => [row.variant, { impressions: row.impressions, conversions: row.conversions }]));
}
