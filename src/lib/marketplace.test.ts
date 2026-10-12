import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * When the free Firestore quota ran out, the marketplace's directory read failed first and the
 * prediction-accuracy read, started alongside it but awaited later, failed a moment after with
 * nothing observing it. Node ends the process on an unhandled rejection, so each such request took
 * the serving function down ("Node.js process exited with exit status: 128" in the Vercel logs).
 */

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase-config", () => ({ isSupabaseCutoverActive: () => false }));
vi.mock("@/lib/scheduling", () => ({ getPractitionerDirectory: vi.fn() }));
// A plain function, not vi.fn: a vi.fn attaches its own handler to every promise it returns (to
// record how it settled), which would mark the very rejection under test as handled.
const accuracy = vi.hoisted(() => ({ read: (): Promise<Map<string, { accuracyPercent: number; resolvedCount: number }>> => Promise.resolve(new Map()) }));
vi.mock("@/lib/predictions", () => ({ getPractitionerAccuracyMap: () => accuracy.read() }));

const { getPractitionerDirectory } = await import("@/lib/scheduling");
const { getMarketplacePractitioners } = await import("@/lib/marketplace");

const quotaExceeded = () => Object.assign(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."), { code: 8 });

describe("getMarketplacePractitioners when Firestore is out of quota", () => {
  const unhandled: unknown[] = [];
  const record = (reason: unknown) => unhandled.push(reason);
  afterEach(() => {
    process.off("unhandledRejection", record);
    unhandled.length = 0;
  });

  it("falls back to an empty list and leaves no rejection unhandled", async () => {
    process.on("unhandledRejection", record);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getPractitionerDirectory).mockRejectedValue(quotaExceeded());
    // Fails after the directory read has already failed, as it did in production.
    accuracy.read = () => new Promise((_, reject) => setTimeout(() => reject(quotaExceeded()), 20));

    expect(await getMarketplacePractitioners()).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(unhandled).toEqual([]);
  });
});
