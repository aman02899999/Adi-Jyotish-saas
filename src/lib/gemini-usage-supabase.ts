import "server-only";

import { query } from "@/lib/postgres";

/**
 * The daily Gemini call budget on Postgres. The claim is one statement: it increments the day's
 * count only while it is under the limit, so concurrent readings cannot both take the last call —
 * the guarantee the Firestore transaction gave, without a read-then-write.
 */
export async function claimGeminiCallInSupabase(day: string, limit: number): Promise<boolean> {
  const { rows } = await query<{ count: number }>(
    `insert into public.gemini_usage (day, count) values ($1, 1)
     on conflict (day) do update set count = public.gemini_usage.count + 1, updated_at = now()
       where public.gemini_usage.count < $2
     returning count`,
    [day, limit],
  );
  // A limit of zero or less allows nothing, including the first call of the day.
  return rows.length > 0 && rows[0].count <= limit;
}

/** Gives back a claim whose call produced no reading; never below zero. */
export async function releaseGeminiCallInSupabase(day: string): Promise<void> {
  await query(`update public.gemini_usage set count = greatest(count - 1, 0), updated_at = now() where day = $1`, [day]);
}

export async function getGeminiUsageInSupabase(day: string): Promise<number> {
  const { rows } = await query<{ count: number }>(`select count from public.gemini_usage where day = $1`, [day]);
  return rows[0]?.count ?? 0;
}
