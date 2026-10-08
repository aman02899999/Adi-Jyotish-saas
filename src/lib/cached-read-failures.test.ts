import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These public reads degrade instead of 500ing — an unreachable database shows an empty
 * marketplace rather than an error page. The bug this pins down is where that fallback was
 * produced: inside the `unstable_cache` callback, which made it a perfectly ordinary resolved
 * value for the cache to store and serve for the rest of the TTL.
 *
 * So one transient failure did not degrade one request, it degraded every request for the whole
 * window — up to an hour for the homepage stats and testimonials. Production bore that out:
 * getHomepageStats logged 84 errors but reached 76 distinct users, because each error kept
 * serving zeros long after the database recovered.
 *
 * The fix is to catch outside the cache, so a failure propagates out of the cached callback,
 * nothing is written, and the next request retries. The mock below models exactly the part of
 * `unstable_cache` that matters here: resolved values are memoised, rejections are not.
 */

const memo = new Map<string, unknown>();

vi.mock("next/cache", () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>, keys: string[]) =>
    async (...args: A): Promise<R> => {
      const key = `${keys.join(":")}|${JSON.stringify(args)}`;
      if (memo.has(key)) return memo.get(key) as R;
      // A rejection escapes without ever reaching memo.set — the real cache does not store one
      // either. That asymmetry is the whole point of the fix.
      const value = await fn(...args);
      memo.set(key, value);
      return value;
    },
  revalidateTag: vi.fn(),
}));

/** Stands in for the database: fails on the first call of each test, healthy after. The failure
 * budget is reset per test, so every case starts from the same outage-then-recovery shape. */
function flakyOnce<T>(value: T) {
  let failed = false;
  const fn = vi.fn(async (..._args: unknown[]) => {
    if (!failed) {
      failed = true;
      throw new Error("8 RESOURCE_EXHAUSTED: Quota exceeded.");
    }
    return value;
  });
  return Object.assign(fn, { resetFailure: () => { failed = false; } });
}

const STATS = { consultationsDelivered: 7, practitionerCount: 3, averageRating: 4.6, reviewCount: 11 };

vi.mock("@/lib/supabase-config", () => ({ isSupabaseCutoverActive: () => true }));
vi.mock("@/lib/firestore", () => ({ db: {}, withIndexFallback: vi.fn() }));
vi.mock("@/lib/marketplace", () => ({ getMarketplacePractitioners: vi.fn(), getReviewScores: vi.fn() }));
vi.mock("@/lib/review-provenance", () => ({ isSyntheticReview: () => false, MEMBER_REVIEW_SOURCE: "member" }));

const getHomepageStatsInSupabase = flakyOnce(STATS);
const getOnlineNowCountInSupabase = flakyOnce(4);
const getFeaturedTestimonialsInSupabase = flakyOnce([{ reviewerName: "Asha", body: "x".repeat(60), rating: 5 }]);

vi.mock("@/lib/cms-supabase", () => ({
  getHomepageStatsInSupabase: () => getHomepageStatsInSupabase(),
  getOnlineNowCountInSupabase: () => getOnlineNowCountInSupabase(),
  getFeaturedTestimonialsInSupabase: (limit: number) => getFeaturedTestimonialsInSupabase(limit),
}));

beforeEach(() => {
  memo.clear();
  for (const stub of [getHomepageStatsInSupabase, getOnlineNowCountInSupabase, getFeaturedTestimonialsInSupabase]) {
    stub.resetFailure();
    stub.mockClear();
  }
});
afterEach(() => vi.clearAllMocks());

describe("a failed public read is not cached as if it were a result", () => {
  it("serves real stats on the retry instead of an hour of cached zeros", async () => {
    const { getHomepageStats } = await import("@/lib/homepage");

    const duringOutage = await getHomepageStats();
    expect(duringOutage).toEqual({ consultationsDelivered: 0, practitionerCount: 0, averageRating: 0, reviewCount: 0 });

    // The TTL here is 3600s. Before the fix this second call returned the cached zeros, so one
    // blip blanked the homepage's trust strip for an hour.
    expect(await getHomepageStats()).toEqual(STATS);
  });

  it("recovers the online count rather than pinning it to 0", async () => {
    const { getOnlineNowCount } = await import("@/lib/homepage");
    expect(await getOnlineNowCount()).toBe(0);
    expect(await getOnlineNowCount()).toBe(4);
  });

  it("recovers testimonials rather than hiding them for the TTL", async () => {
    const { getFeaturedTestimonials } = await import("@/lib/homepage");
    expect(await getFeaturedTestimonials()).toEqual([]);
    expect(await getFeaturedTestimonials()).toHaveLength(1);
  });

  it("still caches a success, so the fix did not turn caching off", async () => {
    const { getHomepageStats } = await import("@/lib/homepage");
    await getHomepageStats();            // failure, not cached
    await getHomepageStats();            // success, cached
    await getHomepageStats();            // served from cache
    // Two reads reached the database: the failed one and the one that populated the cache.
    expect(getHomepageStatsInSupabase).toHaveBeenCalledTimes(2);
  });
});
