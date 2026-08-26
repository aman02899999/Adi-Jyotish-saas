import { describe, expect, it } from "vitest";
import { ASHTAKAVARGA_GRAHAS, BENEFIC_PLACES, CANONICAL_BAV_TOTALS, CONTRIBUTORS } from "@/lib/vedic/ashtakavarga";
import { EXALTATION, MOOLATRIKONA, NATURAL_ENEMIES, NATURAL_FRIENDS, RASHI_LORDS, avasthaOf, debilitationOf } from "@/lib/vedic/dignity";
import { VIMSHOTTARI_SEQUENCE, VIMSHOTTARI_TOTAL_YEARS, computeVimshottari } from "@/lib/vedic/vimshottari";
import { VARGA_META, vargaRashiIndex, type VargaKey } from "@/lib/vedic/varga";
import { GRAHAS } from "@/lib/astro-engine";

/**
 * These are correctness guards, not behaviour tests. Every assertion here encodes a value that is
 * fixed by the classical literature, so a typo in one of the big lookup tables fails the suite
 * instead of silently shipping a confidently-wrong chart.
 */

describe("Ashtakavarga tables", () => {
  it("gives each planet its canonical total number of bindus", () => {
    for (const graha of ASHTAKAVARGA_GRAHAS) {
      const total = CONTRIBUTORS.reduce((sum, contributor) => sum + BENEFIC_PLACES[graha][contributor].length, 0);
      expect(total, `${graha} BAV total`).toBe(CANONICAL_BAV_TOTALS[graha]);
    }
  });

  it("sums to the canonical Sarvashtakavarga total of 337", () => {
    const grandTotal = ASHTAKAVARGA_GRAHAS.reduce((sum, graha) => sum + CANONICAL_BAV_TOTALS[graha], 0);
    expect(grandTotal).toBe(337);
  });

  it("only ever references houses 1-12, with no duplicates in a row", () => {
    for (const graha of ASHTAKAVARGA_GRAHAS) {
      for (const contributor of CONTRIBUTORS) {
        const houses = BENEFIC_PLACES[graha][contributor];
        expect(new Set(houses).size, `${graha} from ${contributor} has duplicates`).toBe(houses.length);
        for (const house of houses) {
          expect(house, `${graha} from ${contributor}`).toBeGreaterThanOrEqual(1);
          expect(house, `${graha} from ${contributor}`).toBeLessThanOrEqual(12);
        }
      }
    }
  });
});

describe("planetary dignity tables", () => {
  it("assigns exactly one lord to each of the twelve rashis", () => {
    expect(RASHI_LORDS).toHaveLength(12);
    // The seven classical planets own twelve signs between them: the luminaries take one each and
    // the other five take two, so every graha except Sun and Moon must appear exactly twice.
    for (const graha of ["mars", "mercury", "jupiter", "venus", "saturn"] as const) {
      expect(RASHI_LORDS.filter((lord) => lord === graha), `${graha} rulerships`).toHaveLength(2);
    }
    for (const graha of ["sun", "moon"] as const) {
      expect(RASHI_LORDS.filter((lord) => lord === graha), `${graha} rulerships`).toHaveLength(1);
    }
  });

  it("places every debilitation exactly opposite its exaltation", () => {
    for (const graha of GRAHAS) {
      const exalted = EXALTATION[graha];
      if (!exalted) continue;
      const debilitated = debilitationOf(graha)!;
      expect((debilitated.rashiIndex - exalted.rashiIndex + 12) % 12, `${graha}`).toBe(6);
    }
  });

  it("keeps Moolatrikona inside a sign the planet rules, except the Moon", () => {
    for (const [graha, span] of Object.entries(MOOLATRIKONA)) {
      // The Moon is the single classical exception: its Moolatrikona is Vrishabha 4°–30°, which
      // Venus rules and which is also the Moon's own exaltation sign. Every other planet's
      // Moolatrikona falls in a sign it owns outright.
      if (graha === "moon") {
        expect(span!.rashiIndex, "moon moolatrikona sign").toBe(EXALTATION.moon!.rashiIndex);
        expect(span!.from, "moon moolatrikona starts past its exaltation degree").toBeGreaterThan(EXALTATION.moon!.degree);
      } else {
        expect(RASHI_LORDS[span!.rashiIndex], `${graha} moolatrikona sign`).toBe(graha);
      }
      expect(span!.from).toBeLessThan(span!.to);
      expect(span!.to).toBeLessThanOrEqual(30);
    }
  });

  it("never lists a planet as both its own friend and its own enemy", () => {
    for (const graha of GRAHAS) {
      const overlap = NATURAL_FRIENDS[graha].filter((other) => NATURAL_ENEMIES[graha].includes(other));
      expect(overlap, `${graha} has contradictory relations`).toEqual([]);
      expect(NATURAL_FRIENDS[graha]).not.toContain(graha);
      expect(NATURAL_ENEMIES[graha]).not.toContain(graha);
    }
  });

  it("runs Baladi avastha forward in odd signs and backward in even ones", () => {
    // Mesha (index 0) is the 1st and therefore an odd sign; Vrishabha (index 1) is even.
    expect(avasthaOf(0, 1)).toBe("bala");
    expect(avasthaOf(0, 29)).toBe("mrita");
    expect(avasthaOf(1, 1)).toBe("mrita");
    expect(avasthaOf(1, 29)).toBe("bala");
  });
});

describe("Vimshottari dasha", () => {
  it("has a 120-year cycle across nine lords", () => {
    expect(VIMSHOTTARI_SEQUENCE).toHaveLength(9);
    expect(VIMSHOTTARI_SEQUENCE.reduce((sum, entry) => sum + entry.years, 0)).toBe(VIMSHOTTARI_TOTAL_YEARS);
  });

  it("starts from the lord of the Moon's birth nakshatra", () => {
    // 0° sidereal is the very start of Ashwini, whose lord is Ketu, with the full 7 years to run.
    const result = computeVimshottari(0, new Date("2000-01-01T00:00:00Z"));
    expect(result.birthNakshatraName).toBe("Ashwini");
    expect(result.birthNakshatraLord).toBe("ketu");
    expect(result.balanceYears).toBeCloseTo(7, 6);
  });

  it("reduces the first mahadasha to the unelapsed part of the birth nakshatra", () => {
    // Exactly halfway through Ashwini (13°20' / 2 = 6°40') leaves half of Ketu's 7 years.
    const result = computeVimshottari(360 / 27 / 2, new Date("2000-01-01T00:00:00Z"));
    expect(result.elapsedFraction).toBeCloseTo(0.5, 9);
    expect(result.balanceYears).toBeCloseTo(3.5, 9);
  });

  it("follows the fixed lord order after the first period", () => {
    const result = computeVimshottari(0, new Date("2000-01-01T00:00:00Z"));
    expect(result.mahadashas.slice(0, 4).map((period) => period.lord)).toEqual(["ketu", "venus", "sun", "moon"]);
  });

  it("splits every mahadasha into antardashas that exactly refill it", () => {
    const result = computeVimshottari(100, new Date("1990-06-15T10:30:00Z"));
    for (const maha of result.mahadashas.slice(1)) {
      const childYears = maha.children.reduce((sum, child) => sum + child.years, 0);
      expect(childYears, `${maha.lord} antardashas`).toBeCloseTo(maha.years, 6);
      // Each antardasha begins where the previous one ended — no gaps, no overlaps.
      expect(maha.children[0].start.getTime()).toBe(maha.start.getTime());
      expect(maha.children.at(-1)!.end.getTime()).toBeCloseTo(maha.end.getTime(), -2);
    }
  });

  it("starts each mahadasha's antardasha sequence with its own lord", () => {
    const result = computeVimshottari(200, new Date("1985-03-01T00:00:00Z"));
    for (const maha of result.mahadashas.slice(1)) {
      expect(maha.children[0].lord, `${maha.lord} first antardasha`).toBe(maha.lord);
    }
  });
});

describe("divisional charts", () => {
  it("maps every longitude into a valid rashi for every varga", () => {
    for (const varga of Object.keys(VARGA_META) as VargaKey[]) {
      for (let longitude = 0; longitude < 360; longitude += 0.37) {
        const rashi = vargaRashiIndex(longitude, varga);
        expect(Number.isInteger(rashi), `${varga} at ${longitude}`).toBe(true);
        expect(rashi, `${varga} at ${longitude}`).toBeGreaterThanOrEqual(0);
        expect(rashi, `${varga} at ${longitude}`).toBeLessThan(12);
      }
    }
  });

  it("computes D1 as the rashi itself", () => {
    expect(vargaRashiIndex(0, "D1")).toBe(0);
    expect(vargaRashiIndex(35, "D1")).toBe(1);
    expect(vargaRashiIndex(359, "D1")).toBe(11);
  });

  it("applies the classical Navamsa start rules", () => {
    // Movable sign (Mesha) starts from itself.
    expect(vargaRashiIndex(0, "D9")).toBe(0);
    // Fixed sign (Vrishabha, from 30°) starts from the 9th from it — Makara.
    expect(vargaRashiIndex(30, "D9")).toBe(9);
    // Dual sign (Mithuna, from 60°) starts from the 5th from it — Tula.
    expect(vargaRashiIndex(60, "D9")).toBe(6);
  });

  it("gives odd signs the Sun's hora first and even signs the Moon's", () => {
    expect(vargaRashiIndex(1, "D2")).toBe(4);    // Mesha first half → Simha
    expect(vargaRashiIndex(20, "D2")).toBe(3);   // Mesha second half → Karka
    expect(vargaRashiIndex(31, "D2")).toBe(3);   // Vrishabha first half → Karka
    expect(vargaRashiIndex(50, "D2")).toBe(4);   // Vrishabha second half → Simha
  });

  it("walks the Drekkana across the trine from the sign", () => {
    expect(vargaRashiIndex(5, "D3")).toBe(0);   // Mesha 0-10° → Mesha
    expect(vargaRashiIndex(15, "D3")).toBe(4);  // Mesha 10-20° → Simha (5th)
    expect(vargaRashiIndex(25, "D3")).toBe(8);  // Mesha 20-30° → Dhanu (9th)
  });

  it("uses the unequal Trimshamsha spans", () => {
    // Odd sign: Mars, Saturn, Jupiter, Mercury, Venus across 5/5/8/7/5 degrees.
    expect(vargaRashiIndex(2, "D30")).toBe(0);    // Mesha
    expect(vargaRashiIndex(7, "D30")).toBe(10);   // Kumbha
    expect(vargaRashiIndex(14, "D30")).toBe(8);   // Dhanu
    expect(vargaRashiIndex(20, "D30")).toBe(2);   // Mithuna
    expect(vargaRashiIndex(27, "D30")).toBe(6);   // Tula
    // Even sign (Vrishabha from 30°) reverses the rulers.
    expect(vargaRashiIndex(32, "D30")).toBe(1);   // Vrishabha
    expect(vargaRashiIndex(57, "D30")).toBe(7);   // Vrishchika
  });
});
