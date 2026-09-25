import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import { claimGeminiCallInSupabase, getGeminiUsageInSupabase, releaseGeminiCallInSupabase } from "@/lib/gemini-usage-supabase";

/**
 * The daily Gemini spending cap on Postgres. Every AI reading claims one call before it runs; the
 * claim has to be exact under concurrency, or a burst of readings overspends the day's budget.
 * Skipped unless SUPABASE_DB_URL points at a migrated database.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;
const DAY = "itest-1999-01-01";

describeDb("Gemini daily budget on Postgres", () => {
  beforeEach(async () => {
    await query(`delete from public.gemini_usage where day = $1`, [DAY]);
  });
  afterAll(async () => {
    await query(`delete from public.gemini_usage where day = $1`, [DAY]);
    await closePgPool();
  });

  it("allows calls up to the limit and refuses the next", async () => {
    for (let i = 0; i < 3; i += 1) expect(await claimGeminiCallInSupabase(DAY, 3)).toBe(true);
    expect(await claimGeminiCallInSupabase(DAY, 3)).toBe(false);
    expect(await getGeminiUsageInSupabase(DAY)).toBe(3);
  });

  it("never lets a burst of concurrent readings overspend", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => claimGeminiCallInSupabase(DAY, 10)));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(await getGeminiUsageInSupabase(DAY)).toBe(10);
  });

  it("gives back a claim whose call failed, and never goes below zero", async () => {
    await claimGeminiCallInSupabase(DAY, 1);
    await releaseGeminiCallInSupabase(DAY);
    expect(await claimGeminiCallInSupabase(DAY, 1)).toBe(true);
    await releaseGeminiCallInSupabase(DAY);
    await releaseGeminiCallInSupabase(DAY);
    expect(await getGeminiUsageInSupabase(DAY)).toBe(0);
  });

  it("reports zero for a day with no calls", async () => {
    expect(await getGeminiUsageInSupabase(DAY)).toBe(0);
  });
});
