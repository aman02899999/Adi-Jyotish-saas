import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// unstable_cache requires Next's incremental cache, which does not exist outside a
// Next runtime — calling it in vitest throws "Invariant: incrementalCache
// missing". Mocking the settings module isolates that; the code under test is the
// routing in plans.ts, not the cache.
vi.mock("@/lib/studio-settings", () => ({
  getStudioSettings: async () => ({
    studioName: "Adi Jyotish Guru",
    supportEmail: "support@adijyotishguru.com",
    timezone: "Asia/Kolkata",
    currency: "INR",
    cancellationHours: 24,
    bookingLeadMinutes: 15,
    replySlaHours: 24,
    gstRate: 18,
    gstin: null,
    updatedAt: new Date().toISOString(),
  }),
}));

// No Razorpay keys in test. Mocked so ensureRazorpayPlans is a no-op rather than
// attempting a network call.
vi.mock("@/lib/razorpay", () => ({ getRazorpay: () => null }));

import { getAllPlans, getPlanById, getPublicPlans } from "@/lib/plans";
import { closePgPool, query } from "@/lib/postgres";
import { seedPlansInSupabase } from "@/lib/plans-supabase";

/**
 * Proves the cutover gate actually routes plans.ts to Postgres.
 *
 * The assertion is designed so it CANNOT pass on the Firestore fallback path.
 * getAllPlans() swallows every error and returns fallbackPlans(), which contains
 * exactly "plus" and "pro" — so asserting merely "got 2 plans" would pass even if
 * Postgres were never contacted. Instead a plan is seeded with a key the fallback
 * list can never contain; seeing it back is proof the read came from the database.
 *
 * Requires SUPABASE_CUTOVER=true and SUPABASE_DB_URL. Skipped otherwise.
 */
const describeGate = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

// Deliberately not "plus" or "pro": those exist in fallbackPlans().
const MARKER_KEY = "itest-gold";

describeGate("cutover gate routes plans to Postgres", () => {
  beforeAll(async () => {
    await query(`delete from public.membership_plans where key in ('plus', 'pro', $1)`, [MARKER_KEY]);
    await seedPlansInSupabase([
      {
        key: MARKER_KEY,
        name: "Itest Gold",
        tagline: "Marker tier",
        description: "Exists only to prove the read came from Postgres.",
        priceMonthly: 1234,
        priceYearly: 12345,
        currency: "INR",
        features: "a\nb",
        sessionDiscountPercent: 33,
        highlighted: true,
        active: true,
        sortOrder: 7,
      },
    ]);
  });

  afterAll(async () => {
    await query(`delete from public.membership_plans where key in ('plus', 'pro', $1)`, [MARKER_KEY]);
    await closePgPool();
  });

  it("getAllPlans returns a tier that only exists in the database", async () => {
    const plans = await getAllPlans();
    const marker = plans.find((p) => p.key === MARKER_KEY);
    // If this is undefined, the read silently fell back to starter plans.
    expect(marker, "getAllPlans did not read Postgres — it returned fallback plans").toBeDefined();
    expect(marker?.priceMonthly).toBe(1234);
    expect(typeof marker?.priceMonthly).toBe("number");
  });

  it("getPlanById resolves against the database", async () => {
    const plan = await getPlanById(MARKER_KEY);
    expect(plan?.name).toBe("Itest Gold");
    expect(plan?.highlighted).toBe(true);
    expect(plan?.createdAt).toBeInstanceOf(Date);
  });

  it("getPublicPlans filters on the active flag read from the database", async () => {
    await query(`update public.membership_plans set active = false where id = $1`, [MARKER_KEY]);
    const publicPlans = await getPublicPlans();
    expect(publicPlans.some((p) => p.key === MARKER_KEY)).toBe(false);
    await query(`update public.membership_plans set active = true where id = $1`, [MARKER_KEY]);
    const again = await getPublicPlans();
    expect(again.some((p) => p.key === MARKER_KEY)).toBe(true);
  });

  it("returns exactly the database contents, in sortOrder order", async () => {
    // getAllPlans() seeds "plus" (sortOrder 1) and "pro" (sortOrder 2) into the
    // database before reading, so all three are genuinely database rows here — the
    // marker at sortOrder 7 is what still proves the source is Postgres, since
    // fallbackPlans() can never contain it.
    const plans = await getAllPlans();
    // Filtered to the keys this file knows about: getAllPlans() returns every plan in the
    // database, and other integration tests may have rows of their own, so asserting on
    // the whole table would make this fail for unrelated reasons.
    const known = plans.map((p) => p.key).filter((key) => ["plus", "pro", MARKER_KEY].includes(key));
    expect(known).toEqual(["plus", "pro", MARKER_KEY]);
    // ...while still proving the ordering claim over the full result set.
    const orders = plans.map((p) => p.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
