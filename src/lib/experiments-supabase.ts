import "server-only";

import { query } from "@/lib/postgres";

/**
 * Postgres twin for experiment counters. experiment_variants references experiments, so the
 * parent row is created on first use; the counter itself is one upsert, so concurrent
 * impressions all count.
 */
export async function incrementExperimentCounterInSupabase(key: string, description: string, variant: string, counter: "impressions" | "conversions") {
  await query(`insert into public.experiments (id, description) values ($1, $2) on conflict (id) do nothing`, [key, description]);
  await query(
    `insert into public.experiment_variants (id, experiment_key, variant, ${counter}) values ($1, $2, $3, 1)
     on conflict (id) do update set ${counter} = public.experiment_variants.${counter} + 1, updated_at = now()`,
    [`${key}/${variant}`, key, variant],
  );
}

export async function getExperimentCountsInSupabase(key: string): Promise<Map<string, { impressions: number; conversions: number }>> {
  const { rows } = await query<{ variant: string; impressions: number; conversions: number }>(
    `select variant, impressions, conversions from public.experiment_variants where experiment_key = $1`,
    [key],
  );
  return new Map(rows.map((row) => [row.variant, { impressions: row.impressions, conversions: row.conversions }]));
}
