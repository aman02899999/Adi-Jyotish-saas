import { describe, expect, it } from "vitest";
import { computeAshtakoot } from "@/lib/ashtakoot";

describe("computeAshtakoot", () => {
  it("never exceeds the classical 36-point maximum", () => {
    // Sweep every rashi/nakshatra pairing on a coarse grid — the score must stay within [0, 36] for all of it.
    for (let brideRashi = 0; brideRashi < 12; brideRashi += 3) {
      for (let groomRashi = 0; groomRashi < 12; groomRashi += 3) {
        for (let brideNak = 0; brideNak < 27; brideNak += 4) {
          for (let groomNak = 0; groomNak < 27; groomNak += 4) {
            const result = computeAshtakoot({ brideMoonRashi: brideRashi, brideMoonNakshatra: brideNak, groomMoonRashi: groomRashi, groomMoonNakshatra: groomNak });
            expect(result.totalScore).toBeGreaterThanOrEqual(0);
            expect(result.totalScore).toBeLessThanOrEqual(36);
          }
        }
      }
    }
  });

  it("flags Nadi Dosha when both people share the same nakshatra (and therefore the same Nadi)", () => {
    const result = computeAshtakoot({ brideMoonRashi: 0, brideMoonNakshatra: 5, groomMoonRashi: 3, groomMoonNakshatra: 5 });
    expect(result.nadiDosha).toBe(true);
    expect(result.breakdown.nadi).toBe(0);
  });

  it("does not flag Bhakoot Dosha for the same rashi (zero sign distance)", () => {
    const result = computeAshtakoot({ brideMoonRashi: 4, brideMoonNakshatra: 0, groomMoonRashi: 4, groomMoonNakshatra: 10 });
    expect(result.bhakootDosha).toBe(false);
  });

  it("cancels Nadi Dosha for the classical same-nakshatra-different-pada exception", () => {
    const withoutException = computeAshtakoot({ brideMoonRashi: 0, brideMoonNakshatra: 5, groomMoonRashi: 3, groomMoonNakshatra: 5 });
    expect(withoutException.nadiDosha).toBe(true);
    const withException = computeAshtakoot({ brideMoonRashi: 0, brideMoonNakshatra: 5, groomMoonRashi: 3, groomMoonNakshatra: 5, bridePada: 1, groomPada: 3 });
    expect(withException.breakdown.nadi).toBe(0); // score is unchanged — only the dosha flag is exempted
    expect(withException.nadiDosha).toBe(false);
  });

  it("does not cancel Nadi Dosha when the pada also matches (no exception applies)", () => {
    const result = computeAshtakoot({ brideMoonRashi: 0, brideMoonNakshatra: 5, groomMoonRashi: 3, groomMoonNakshatra: 5, bridePada: 2, groomPada: 2 });
    expect(result.nadiDosha).toBe(true);
  });

  it("cancels Bhakoot Dosha when both Moon signs share the same ruling planet", () => {
    // Mesha (0) and Vrishchika (7) are both Mars-ruled and sit at a 6-8 distance (dosha distance 8).
    const result = computeAshtakoot({ brideMoonRashi: 0, brideMoonNakshatra: 0, groomMoonRashi: 7, groomMoonNakshatra: 0 });
    expect(result.breakdown.bhakoot).toBe(0); // score is unchanged — only the dosha flag is exempted
    expect(result.bhakootDosha).toBe(false);
  });

  it("is direction-sensitive, matching classical Varna ranking rules (swapping bride/groom can change the score)", () => {
    // This documents real Ashtakoot behavior: Varna compares ranks asymmetrically, so the
    // total is not simply symmetric under a bride/groom swap — a regression here would be a bug.
    const a = computeAshtakoot({ brideMoonRashi: 1, brideMoonNakshatra: 8, groomMoonRashi: 7, groomMoonNakshatra: 19 });
    const b = computeAshtakoot({ brideMoonRashi: 7, brideMoonNakshatra: 19, groomMoonRashi: 1, groomMoonNakshatra: 8 });
    expect(a.totalScore).toBe(22.5);
    expect(b.totalScore).toBe(21.5);
  });
});
