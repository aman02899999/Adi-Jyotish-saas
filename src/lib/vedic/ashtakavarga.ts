import "server-only";

import { GrahaKey, GrahaPosition, RASHIS, countFrom } from "@/lib/vedic/core";

/**
 * Ashtakavarga — the classical bindu (benefic point) system. For each of the seven classical
 * planets, eight reference points (the seven planets plus the Lagna) each contribute a point to a
 * fixed set of houses counted from themselves. Summing those contributions per rashi gives that
 * planet's Bhinnashtakavarga (BAV); summing all seven BAVs gives the Sarvashtakavarga (SAV),
 * which is what transit and house-strength judgements actually lean on.
 *
 * The row totals of these tables are fixed constants in the classical literature — Sun 48,
 * Moon 49, Mars 39, Mercury 54, Jupiter 56, Venus 52, Saturn 39, summing to 337. Those constants
 * are asserted in ashtakavarga.test.ts, so a mistyped entry in any table below fails the test
 * suite instead of silently shipping a wrong bindu count.
 */

/** Ashtakavarga is computed only for the seven classical planets — the nodes have none. */
export type ClassicalGraha = Extract<GrahaKey, "sun" | "moon" | "mars" | "mercury" | "jupiter" | "venus" | "saturn">;

export const ASHTAKAVARGA_GRAHAS: ClassicalGraha[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

/** The eight contributors: the seven classical planets, then the Lagna. */
export type Contributor = ClassicalGraha | "lagna";
export const CONTRIBUTORS: Contributor[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "lagna"];

/** Canonical BAV totals — universally agreed in the classical sources, used as a checksum. */
export const CANONICAL_BAV_TOTALS: Record<ClassicalGraha, number> = {
  sun: 48, moon: 49, mars: 39, mercury: 54, jupiter: 56, venus: 52, saturn: 39,
};

type BenefiPlaces = Record<Contributor, number[]>;

/** Houses (counted from each contributor) in which the subject planet gains a bindu. */
export const BENEFIC_PLACES: Record<ClassicalGraha, BenefiPlaces> = {
  sun: {
    sun: [1, 2, 4, 7, 8, 9, 10, 11],
    moon: [3, 6, 10, 11],
    mars: [1, 2, 4, 7, 8, 9, 10, 11],
    mercury: [3, 5, 6, 9, 10, 11, 12],
    jupiter: [5, 6, 9, 11],
    venus: [6, 7, 12],
    saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    lagna: [3, 4, 6, 10, 11, 12],
  },
  moon: {
    sun: [3, 6, 7, 8, 10, 11],
    moon: [1, 3, 6, 7, 9, 10, 11],
    mars: [2, 3, 5, 6, 9, 10, 11],
    mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    jupiter: [1, 4, 7, 8, 10, 11],
    venus: [3, 4, 5, 7, 9, 10, 11],
    saturn: [3, 5, 6, 11],
    lagna: [3, 6, 10, 11],
  },
  mars: {
    sun: [3, 5, 6, 10, 11],
    moon: [3, 6, 11],
    mars: [1, 2, 4, 7, 8, 10, 11],
    mercury: [3, 5, 6, 11],
    jupiter: [6, 10, 11, 12],
    venus: [6, 8, 11, 12],
    saturn: [1, 4, 7, 8, 9, 10, 11],
    lagna: [1, 3, 6, 10, 11],
  },
  mercury: {
    sun: [5, 6, 9, 11, 12],
    moon: [2, 4, 6, 8, 10, 11],
    mars: [1, 2, 4, 7, 8, 9, 10, 11],
    mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    jupiter: [6, 8, 11, 12],
    venus: [1, 2, 3, 4, 5, 8, 9, 11],
    saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    lagna: [1, 2, 4, 6, 8, 10, 11],
  },
  jupiter: {
    sun: [1, 2, 3, 4, 7, 8, 9, 10, 11],
    moon: [2, 5, 7, 9, 11],
    mars: [1, 2, 4, 7, 8, 10, 11],
    mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
    venus: [2, 5, 6, 9, 10, 11],
    saturn: [3, 5, 6, 12],
    lagna: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  venus: {
    sun: [8, 11, 12],
    moon: [1, 2, 3, 4, 5, 8, 9, 11, 12],
    mars: [3, 5, 6, 9, 11, 12],
    mercury: [3, 5, 6, 9, 11],
    jupiter: [5, 8, 9, 10, 11],
    venus: [1, 2, 3, 4, 5, 8, 9, 10, 11],
    saturn: [3, 4, 5, 8, 9, 10, 11],
    lagna: [1, 2, 3, 4, 5, 8, 9, 11],
  },
  saturn: {
    sun: [1, 2, 4, 7, 8, 10, 11],
    moon: [3, 6, 11],
    mars: [3, 5, 6, 10, 11, 12],
    mercury: [6, 8, 9, 10, 11, 12],
    jupiter: [5, 6, 11, 12],
    venus: [6, 11, 12],
    saturn: [3, 5, 6, 11],
    lagna: [1, 3, 4, 6, 10, 11],
  },
};

export type BhinnashtakavargaChart = {
  graha: ClassicalGraha;
  /** Bindus per rashi, indexed 0 = Mesha. Always sums to that planet's canonical total. */
  bindusByRashi: number[];
  total: number;
};

/** Bhinnashtakavarga for one planet: bindus in each of the twelve rashis. */
export function computeBhinnashtakavarga(graha: ClassicalGraha, positions: GrahaPosition[], ascendantRashiIndex: number): BhinnashtakavargaChart {
  const table = BENEFIC_PLACES[graha];
  const bindusByRashi = new Array(12).fill(0);

  for (const contributor of CONTRIBUTORS) {
    const contributorRashi = contributor === "lagna"
      ? ascendantRashiIndex
      : positions.find((position) => position.graha === contributor)?.rashiIndex;
    if (contributorRashi === undefined) continue;

    for (const house of table[contributor]) {
      // `house` is a 1-based count from the contributor, so house 1 is the contributor's own sign.
      bindusByRashi[(contributorRashi + house - 1) % 12] += 1;
    }
  }

  return { graha, bindusByRashi, total: bindusByRashi.reduce((sum, value) => sum + value, 0) };
}

export type AshtakavargaResult = {
  bhinna: BhinnashtakavargaChart[];
  /** Sarvashtakavarga: the seven BAVs summed per rashi. Always totals 337. */
  sarvaByRashi: number[];
  sarvaTotal: number;
  /** SAV bindus arranged by house from the Lagna, which is how transits are actually judged. */
  sarvaByHouse: { house: number; rashiIndex: number; rashiName: string; bindus: number }[];
  strongestHouses: number[];
  weakestHouses: number[];
};

/**
 * Full Ashtakavarga for a chart.
 *
 * Reading guide for the SAV numbers: the average per rashi is 337/12 ≈ 28. Houses above ~30 are
 * classically treated as supportive, below ~25 as needing care — which is why the strongest and
 * weakest houses are surfaced directly rather than leaving the reader to scan twelve numbers.
 */
export function computeAshtakavarga(positions: GrahaPosition[], ascendantRashiIndex: number): AshtakavargaResult {
  const bhinna = ASHTAKAVARGA_GRAHAS.map((graha) => computeBhinnashtakavarga(graha, positions, ascendantRashiIndex));

  const sarvaByRashi = new Array(12).fill(0);
  for (const chart of bhinna) {
    for (let rashi = 0; rashi < 12; rashi += 1) sarvaByRashi[rashi] += chart.bindusByRashi[rashi];
  }

  const sarvaByHouse = Array.from({ length: 12 }, (_, index) => {
    const rashiIndex = (ascendantRashiIndex + index) % 12;
    return { house: index + 1, rashiIndex, rashiName: RASHIS[rashiIndex].name, bindus: sarvaByRashi[rashiIndex] };
  });

  const sorted = [...sarvaByHouse].sort((a, b) => b.bindus - a.bindus);

  return {
    bhinna,
    sarvaByRashi,
    sarvaTotal: sarvaByRashi.reduce((sum, value) => sum + value, 0),
    sarvaByHouse,
    strongestHouses: sorted.slice(0, 3).map((entry) => entry.house),
    weakestHouses: sorted.slice(-3).reverse().map((entry) => entry.house),
  };
}

/** Bindus a specific planet's BAV assigns to the rashi it currently occupies — its transit strength. */
export function transitBindus(chart: BhinnashtakavargaChart, rashiIndex: number) {
  return chart.bindusByRashi[rashiIndex];
}

/** Count from one rashi to another for display alongside a bindu figure. */
export function houseDistance(fromRashiIndex: number, toRashiIndex: number) {
  return countFrom(fromRashiIndex, toRashiIndex);
}
