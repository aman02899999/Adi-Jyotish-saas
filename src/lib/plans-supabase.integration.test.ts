import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePgPool, isUniqueViolation, query } from "@/lib/postgres";
import {
  getAllPlansFromSupabase,
  getPlanByIdFromSupabase,
  insertPlanInSupabase,
  seedPlansInSupabase,
  updatePlanInSupabase,
} from "@/lib/plans-supabase";
import { fetchStudioSettingsFromSupabase, updateStudioSettingsInSupabase } from "@/lib/studio-settings-supabase";
import { STUDIO_SETTINGS_DEFAULTS } from "@/lib/studio-settings-defaults";

/**
 * Integration coverage for the ported data layer. Skipped unless
 * SUPABASE_DB_URL points at a reachable database carrying the migration schema.
 *
 * These exercise the Postgres paths directly. The Firestore paths are unchanged
 * and covered by the existing suite; what is new is that both layers must return
 * an identically-shaped object, which is what makes the cutover reversible.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable \
 *     npx vitest run src/lib/plans-supabase.integration.test.ts
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

describeDb("plans on Postgres", () => {
  beforeAll(async () => {
    await query(`delete from public.membership_plans where key in ('plus', 'pro')`);
    await query(`delete from public.studio_settings`);
  });

  afterAll(async () => {
    await query(`delete from public.membership_plans where key in ('plus', 'pro')`);
    await query(`delete from public.studio_settings`);
    await closePgPool();
  });

  it("seeds idempotently — a second run adds nothing", async () => {
    const starter = [
      {
        key: "plus",
        name: "Plus",
        tagline: "For a steady personal cosmic practice",
        description: "Deeper daily guidance.",
        priceMonthly: 299,
        priceYearly: 2999,
        currency: "INR",
        features: "Line one\nLine two",
        sessionDiscountPercent: 10,
        highlighted: false,
        active: true,
        sortOrder: 1,
      },
    ];
    await seedPlansInSupabase(starter);
    await seedPlansInSupabase(starter);
    // Scoped to the key this file seeds. Other integration tests share this database and
    // may hold plan rows of their own, so an unfiltered count would fail for reasons that
    // have nothing to do with whether seeding is idempotent.
    const rows = (await getAllPlansFromSupabase()).filter((plan) => plan.key === "plus");
    expect(rows).toHaveLength(1);
  });

  it("returns prices as numbers, not the strings node-postgres gives back", async () => {
    const plan = (await getAllPlansFromSupabase()).find((row) => row.key === "plus");
    // This is the assertion that catches a missing numericColumns entry. Against a
    // string it would be "299", and every discount calculation would concatenate.
    expect(typeof plan?.priceMonthly).toBe("number");
    expect(plan?.priceMonthly).toBe(299);
    expect(plan?.priceYearly).toBe(2999);
    expect(typeof plan?.sessionDiscountPercent).toBe("number");
  });

  it("returns createdAt/updatedAt as Dates, matching the Firestore models", async () => {
    const plan = (await getAllPlansFromSupabase()).find((row) => row.key === "plus");
    expect(plan?.createdAt).toBeInstanceOf(Date);
    expect(plan?.updatedAt).toBeInstanceOf(Date);
  });

  it("orders by sortOrder", async () => {
    await seedPlansInSupabase([
      {
        key: "pro",
        name: "Pro",
        tagline: "",
        description: "",
        priceMonthly: 799,
        priceYearly: 7999,
        currency: "INR",
        features: "",
        sessionDiscountPercent: 20,
        highlighted: true,
        active: true,
        sortOrder: 2,
      },
    ]);
    const rows = (await getAllPlansFromSupabase()).filter((r) => ["plus", "pro"].includes(r.key));
    expect(rows.map((r) => r.key)).toEqual(["plus", "pro"]);
  });

  it("reads a single plan by id", async () => {
    const plan = await getPlanByIdFromSupabase("pro");
    expect(plan?.name).toBe("Pro");
    expect(plan?.highlighted).toBe(true);
    expect(await getPlanByIdFromSupabase("nope")).toBeNull();
  });

  it("applies a partial update and leaves other fields alone", async () => {
    const updated = await updatePlanInSupabase("plus", { priceMonthly: 349, active: false });
    expect(updated.priceMonthly).toBe(349);
    expect(updated.active).toBe(false);
    // tagline was not in the patch and must survive untouched.
    expect(updated.tagline).toBe("For a steady personal cosmic practice");
  });

  it("rejects a duplicate key with a unique violation", async () => {
    try {
      await insertPlanInSupabase({
        key: "plus",
        name: "Duplicate",
        tagline: "",
        description: "",
        priceMonthly: 1,
        priceYearly: null,
        currency: "INR",
        features: "",
        sessionDiscountPercent: 0,
        highlighted: false,
        active: true,
        sortOrder: 9,
      });
      throw new Error("expected a unique violation");
    } catch (error) {
      if (error instanceof Error && error.message === "expected a unique violation") throw error;
      expect(isUniqueViolation(error)).toBe(true);
    }
  });
});

describeDb("studio settings on Postgres", () => {
  it("creates the singleton from defaults on first read", async () => {
    await query(`delete from public.studio_settings`);
    const settings = await fetchStudioSettingsFromSupabase();
    expect(settings.studioName).toBe(STUDIO_SETTINGS_DEFAULTS.studioName);
    expect(settings.timezone).toBe(STUDIO_SETTINGS_DEFAULTS.timezone);
    // numeric(6,3) — must be coerced or tax maths breaks.
    expect(typeof settings.gstRate).toBe("number");
    expect(settings.gstRate).toBe(18);
    expect(typeof settings.updatedAt).toBe("string");
  });

  it("applies a partial patch", async () => {
    const updated = await updateStudioSettingsInSupabase({ currency: "USD", bookingLeadMinutes: 30 });
    expect(updated.currency).toBe("USD");
    expect(updated.bookingLeadMinutes).toBe(30);
    expect(updated.studioName).toBe(STUDIO_SETTINGS_DEFAULTS.studioName);
  });

  it("keeps reading the same singleton row", async () => {
    const again = await fetchStudioSettingsFromSupabase();
    expect(again.currency).toBe("USD");
    const { rows } = await query(`select count(*)::int n from public.studio_settings`);
    expect(rows[0]?.n).toBe(1);
  });
});
