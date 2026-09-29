import { describe, expect, it } from "vitest";

import { GENUINE_REVIEW_SQL, genuineReviews, isSyntheticReview } from "@/lib/review-provenance";

describe("review provenance", () => {
  it("treats only source === 'seed' as synthetic", () => {
    expect(isSyntheticReview({ source: "seed" })).toBe(true);
    expect(isSyntheticReview({ source: "member" })).toBe(false);
  });

  it("treats a missing source as genuine — every review written before provenance existed", () => {
    expect(isSyntheticReview({})).toBe(false);
    expect(isSyntheticReview({ source: null })).toBe(false);
    expect(isSyntheticReview({ source: undefined })).toBe(false);
  });

  it("is exact, not a substring match", () => {
    expect(isSyntheticReview({ source: "seeded" })).toBe(false);
    expect(isSyntheticReview({ source: "SEED" })).toBe(false);
  });

  it("filters a mixed list down to genuine reviews, keeping order", () => {
    const rows = [{ id: 1, source: null }, { id: 2, source: "seed" }, { id: 3 }, { id: 4, source: "member" }];
    expect(genuineReviews(rows).map((row) => row.id)).toEqual([1, 3, 4]);
  });

  it("keeps null sources in SQL, where null <> 'seed' is null and would be filtered out", () => {
    expect(GENUINE_REVIEW_SQL).toBe("coalesce(source, '') <> 'seed'");
  });
});
