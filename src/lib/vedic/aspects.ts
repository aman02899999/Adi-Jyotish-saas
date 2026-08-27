import "server-only";

import { GRAHA_LABELS, GrahaKey, GrahaPosition, RASHIS, countFrom, houseOfRashi, ordinal } from "@/lib/vedic/core";

/**
 * Graha Drishti (planetary aspects). Every graha aspects the 7th house from itself with full
 * strength. Three planets carry additional special aspects that are the backbone of Parashari
 * judgement: Mars sees the 4th and 8th, Jupiter the 5th and 9th, Saturn the 3rd and 10th.
 *
 * Rahu and Ketu are given the 5th/7th/9th here, which is the majority Parashari position; a
 * minority of schools restrict the nodes to the 7th alone, so node aspects are flagged in the
 * output and can be filtered by the caller.
 */

const SPECIAL_ASPECTS: Partial<Record<GrahaKey, number[]>> = {
  mars: [4, 8],
  jupiter: [5, 9],
  saturn: [3, 10],
  rahu: [5, 9],
  ketu: [5, 9],
};

/** The 1-based house distances a graha aspects, always including the universal 7th. */
export function aspectDistancesOf(graha: GrahaKey): number[] {
  return [7, ...(SPECIAL_ASPECTS[graha] ?? [])].sort((a, b) => a - b);
}

export type Aspect = {
  from: GrahaKey;
  /** 1-based house distance counted from the aspecting graha's own sign. */
  distance: number;
  targetRashiIndex: number;
  /** House number of the target counted from the Lagna. */
  targetHouse: number;
  /** Grahas sitting in the aspected sign, if any. */
  aspectedGrahas: GrahaKey[];
  isSpecialAspect: boolean;
  isNodeAspect: boolean;
};

/** Every aspect cast in the chart, resolved to the sign and planets each one lands on. */
export function computeAspects(positions: GrahaPosition[], ascendantRashiIndex: number): Aspect[] {
  const aspects: Aspect[] = [];

  for (const position of positions) {
    for (const distance of aspectDistancesOf(position.graha)) {
      const targetRashiIndex = (position.rashiIndex + distance - 1) % 12;
      aspects.push({
        from: position.graha,
        distance,
        targetRashiIndex,
        targetHouse: houseOfRashi(targetRashiIndex, ascendantRashiIndex),
        aspectedGrahas: positions.filter((other) => other.rashiIndex === targetRashiIndex && other.graha !== position.graha).map((other) => other.graha),
        isSpecialAspect: distance !== 7,
        isNodeAspect: position.graha === "rahu" || position.graha === "ketu",
      });
    }
  }

  return aspects;
}

/** Whether `from` aspects the sign `targetRashiIndex`. */
export function aspectsRashi(from: GrahaPosition, targetRashiIndex: number) {
  return aspectDistancesOf(from.graha).includes(countFrom(from.rashiIndex, targetRashiIndex));
}

/** Whether `from` aspects `toward` (planet-to-planet drishti). */
export function aspectsGraha(from: GrahaPosition, toward: GrahaPosition) {
  return aspectsRashi(from, toward.rashiIndex);
}

/** Grahas aspecting a given house — used to judge whether a house is supported or afflicted. */
export function grahasAspectingHouse(positions: GrahaPosition[], ascendantRashiIndex: number, house: number): GrahaKey[] {
  const targetRashiIndex = (ascendantRashiIndex + house - 1) % 12;
  return positions.filter((position) => aspectsRashi(position, targetRashiIndex)).map((position) => position.graha);
}

/** One readable line per aspect, for the narrative report. */
export function describeAspect(aspect: Aspect) {
  const target = aspect.aspectedGrahas.length
    ? `${RASHIS[aspect.targetRashiIndex].name} (${ordinal(aspect.targetHouse)} house), aspecting ${aspect.aspectedGrahas.map((graha) => GRAHA_LABELS[graha]).join(", ")}`
    : `${RASHIS[aspect.targetRashiIndex].name} (${ordinal(aspect.targetHouse)} house)`;
  return `${GRAHA_LABELS[aspect.from]} casts its ${ordinal(aspect.distance)}-house aspect on ${target}`;
}
