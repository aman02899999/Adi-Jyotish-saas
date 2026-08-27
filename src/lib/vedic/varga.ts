import "server-only";

import { GRAHAS, GrahaKey, GrahaPosition, RASHIS, degreeWithinRashi, elementOf, isOddRashi, modalityOf, normalizeDeg, rashiIndexOf } from "@/lib/vedic/core";

/**
 * Divisional charts (Vargas) — the Shodashavarga set of sixteen. Each varga subdivides every
 * rashi into N parts and maps each part onto a rashi by a technique-specific rule; the resulting
 * chart is read for one specific area of life (D9 for marriage and inner strength, D10 for
 * career, D7 for children, and so on).
 *
 * Every rule below is the Brihat Parashara Hora Shastra form. Where a technique has more than one
 * living tradition (notably D60), the variant chosen is the one standard commercial engines
 * implement, and the divergence is noted on that rule.
 */

export type VargaKey = "D1" | "D2" | "D3" | "D4" | "D7" | "D9" | "D10" | "D12" | "D16" | "D20" | "D24" | "D27" | "D30" | "D40" | "D45" | "D60";

export const VARGA_META: Record<VargaKey, { divisor: number; name: string; sanskrit: string; signifies: string }> = {
  D1: { divisor: 1, name: "Rashi", sanskrit: "Rashi", signifies: "The physical body and overall life — the main birth chart" },
  D2: { divisor: 2, name: "Hora", sanskrit: "Hora", signifies: "Wealth and material resources" },
  D3: { divisor: 3, name: "Drekkana", sanskrit: "Drekkana", signifies: "Siblings, courage, and initiative" },
  D4: { divisor: 4, name: "Chaturthamsha", sanskrit: "Chaturthamsha", signifies: "Property, home, and inner contentment" },
  D7: { divisor: 7, name: "Saptamsha", sanskrit: "Saptamsha", signifies: "Children and lineage" },
  D9: { divisor: 9, name: "Navamsa", sanskrit: "Navamsa", signifies: "Marriage, dharma, and the true strength of every planet" },
  D10: { divisor: 10, name: "Dashamsha", sanskrit: "Dashamsha", signifies: "Career, profession, and public standing" },
  D12: { divisor: 12, name: "Dwadashamsha", sanskrit: "Dwadashamsha", signifies: "Parents and ancestry" },
  D16: { divisor: 16, name: "Shodashamsha", sanskrit: "Shodashamsha", signifies: "Vehicles, comforts, and luxuries" },
  D20: { divisor: 20, name: "Vimshamsha", sanskrit: "Vimshamsha", signifies: "Spiritual practice and religious inclination" },
  D24: { divisor: 24, name: "Siddhamsha", sanskrit: "Chaturvimshamsha", signifies: "Education, learning, and knowledge" },
  D27: { divisor: 27, name: "Bhamsha", sanskrit: "Nakshatramsha", signifies: "Physical strengths and weaknesses" },
  D30: { divisor: 30, name: "Trimshamsha", sanskrit: "Trimshamsha", signifies: "Misfortunes, evils, and character flaws" },
  D40: { divisor: 40, name: "Khavedamsha", sanskrit: "Khavedamsha", signifies: "Auspicious and inauspicious effects from the maternal line" },
  D45: { divisor: 45, name: "Akshavedamsha", sanskrit: "Akshavedamsha", signifies: "General character and conduct" },
  D60: { divisor: 60, name: "Shashtiamsha", sanskrit: "Shashtiamsha", signifies: "Karmic inheritance — the finest level of past-life detail" },
};

/** The six vargas of the Shadvarga group, the subset most readings actually use. */
export const CORE_VARGAS: VargaKey[] = ["D1", "D2", "D3", "D9", "D12", "D30"];

/** Trimshamsha is unequal: five uneven spans ruled by the five non-luminary planets. */
function trimshamshaSign(rashiIndex: number, degree: number) {
  if (isOddRashi(rashiIndex)) {
    if (degree < 5) return 0;   // Mars — Mesha
    if (degree < 10) return 10; // Saturn — Kumbha
    if (degree < 18) return 8;  // Jupiter — Dhanu
    if (degree < 25) return 2;  // Mercury — Mithuna
    return 6;                   // Venus — Tula
  }
  if (degree < 5) return 1;     // Venus — Vrishabha
  if (degree < 12) return 5;    // Mercury — Kanya
  if (degree < 20) return 11;   // Jupiter — Meena
  if (degree < 25) return 9;    // Saturn — Makara
  return 7;                     // Mars — Vrishchika
}

/**
 * The rashi a longitude falls into within a given varga.
 *
 * Each branch is the classical start-sign rule for that division: the part index is always
 * `floor(degreeInRashi / (30 / divisor))`, and what differs between techniques is only which
 * rashi the counting starts from.
 */
export function vargaRashiIndex(siderealLongitude: number, varga: VargaKey): number {
  const longitude = normalizeDeg(siderealLongitude);
  const rashiIndex = rashiIndexOf(longitude);
  const degree = degreeWithinRashi(longitude);
  const divisor = VARGA_META[varga].divisor;
  const part = Math.min(divisor - 1, Math.floor(degree / (30 / divisor)));

  switch (varga) {
    case "D1":
      return rashiIndex;

    // Odd signs give the first half to the Sun's hora (Simha) and the second to the Moon's
    // (Karka); even signs reverse it.
    case "D2":
      return isOddRashi(rashiIndex) ? (part === 0 ? 4 : 3) : (part === 0 ? 3 : 4);

    // Same sign, then the 5th, then the 9th — the trine from the sign itself.
    case "D3":
      return (rashiIndex + part * 4) % 12;

    // Same sign, then the 4th, 7th, 10th — the kendras from the sign itself.
    case "D4":
      return (rashiIndex + part * 3) % 12;

    // Odd signs count from the sign itself; even signs from the 7th.
    case "D7":
      return (rashiIndex + (isOddRashi(rashiIndex) ? 0 : 6) + part) % 12;

    // Movable from itself, fixed from the 9th, dual from the 5th — which reduces exactly to
    // counting continuous 3°20' arcs from Mesha across the whole zodiac.
    case "D9":
      return Math.floor(longitude / (10 / 3)) % 12;

    // Odd signs count from the sign itself; even signs from the 9th.
    case "D10":
      return (rashiIndex + (isOddRashi(rashiIndex) ? 0 : 8) + part) % 12;

    // Always counted from the sign itself.
    case "D12":
      return (rashiIndex + part) % 12;

    // Movable from Mesha, fixed from Simha, dual from Dhanu.
    case "D16":
      return (({ movable: 0, fixed: 4, dual: 8 })[modalityOf(rashiIndex)] + part) % 12;

    // Movable from Mesha, fixed from Dhanu, dual from Simha.
    case "D20":
      return (({ movable: 0, fixed: 8, dual: 4 })[modalityOf(rashiIndex)] + part) % 12;

    // Odd signs from Simha, even signs from Karka.
    case "D24":
      return ((isOddRashi(rashiIndex) ? 4 : 3) + part) % 12;

    // By element: fire from Mesha, earth from Karka, air from Tula, water from Makara.
    case "D27":
      return (({ fire: 0, earth: 3, air: 6, water: 9 })[elementOf(rashiIndex)] + part) % 12;

    case "D30":
      return trimshamshaSign(rashiIndex, degree);

    // Odd signs from Mesha, even signs from Tula.
    case "D40":
      return ((isOddRashi(rashiIndex) ? 0 : 6) + part) % 12;

    // Movable from Mesha, fixed from Simha, dual from Dhanu.
    case "D45":
      return (({ movable: 0, fixed: 4, dual: 8 })[modalityOf(rashiIndex)] + part) % 12;

    // Half-degree steps counted from the sign itself. A minority tradition reverses the count for
    // even signs; the uniform rule below is what mainstream engines implement.
    case "D60":
      return (rashiIndex + Math.floor(degree * 2)) % 12;
  }
}

export type VargaPlacement = { graha: GrahaKey; rashiIndex: number; isRetrograde: boolean };

export type VargaChart = {
  varga: VargaKey;
  name: string;
  sanskrit: string;
  signifies: string;
  ascendantRashiIndex: number;
  placements: VargaPlacement[];
  /** 12 whole-sign houses of this varga, house 1 being its own ascendant. */
  houses: { house: number; rashiIndex: number; occupants: VargaPlacement[] }[];
};

/** Builds one divisional chart, including its own independently-derived ascendant. */
export function buildVargaChart(positions: GrahaPosition[], ascendantLongitude: number, varga: VargaKey): VargaChart {
  const meta = VARGA_META[varga];
  const ascendantRashiIndex = vargaRashiIndex(ascendantLongitude, varga);
  const placements: VargaPlacement[] = positions.map((position) => ({
    graha: position.graha,
    rashiIndex: vargaRashiIndex(position.longitude, varga),
    isRetrograde: position.isRetrograde,
  }));

  const houses = Array.from({ length: 12 }, (_, index) => {
    const rashiIndex = (ascendantRashiIndex + index) % 12;
    return { house: index + 1, rashiIndex, occupants: placements.filter((placement) => placement.rashiIndex === rashiIndex) };
  });

  return { varga, name: meta.name, sanskrit: meta.sanskrit, signifies: meta.signifies, ascendantRashiIndex, placements, houses };
}

export function buildVargaCharts(positions: GrahaPosition[], ascendantLongitude: number, vargas: VargaKey[]): VargaChart[] {
  return vargas.map((varga) => buildVargaChart(positions, ascendantLongitude, varga));
}

/**
 * Vimshopaka Bala — a planet's aggregate strength across a weighted set of vargas, scored out of
 * 20. A planet holding good dignity in many divisions is far stronger than one that only looks
 * good in the birth chart, which is precisely what this number captures.
 *
 * The Shadvarga weighting (D1 6, D2 2, D3 4, D9 5, D12 2, D30 1 — total 20) is used here.
 */
const VIMSHOPAKA_WEIGHTS: Partial<Record<VargaKey, number>> = { D1: 6, D2: 2, D3: 4, D9: 5, D12: 2, D30: 1 };

export function vimshopakaBala(positions: GrahaPosition[], dignityScore: (graha: GrahaKey, rashiIndex: number) => number): { graha: GrahaKey; score: number }[] {
  return GRAHAS.map((graha) => {
    const position = positions.find((entry) => entry.graha === graha)!;
    let score = 0;
    for (const [varga, weight] of Object.entries(VIMSHOPAKA_WEIGHTS) as [VargaKey, number][]) {
      score += weight * dignityScore(graha, vargaRashiIndex(position.longitude, varga));
    }
    return { graha, score: Math.round(score * 100) / 100 };
  });
}

export function vargaRashiName(siderealLongitude: number, varga: VargaKey) {
  return RASHIS[vargaRashiIndex(siderealLongitude, varga)].name;
}
