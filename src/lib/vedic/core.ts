import "server-only";

/**
 * Shared vocabulary for the `vedic/` engine modules. Everything astronomical still comes from
 * astro-engine.ts (real ephemeris + Lahiri ayanamsa); this module only re-exports the pieces the
 * classical-technique modules need plus the small pure helpers they all share, so those modules
 * import from one place instead of reaching across the whole lib.
 */

export {
  GRAHAS,
  GRAHA_LABELS,
  GRAHA_SHORT,
  NAKSHATRAS,
  RASHIS,
  degreeWithinRashi,
  formatDegree,
  nakshatraIndexOf,
  nakshatraPadaOf,
  rashiIndexOf,
} from "@/lib/astro-engine";
export type { GrahaKey, GrahaPosition } from "@/lib/astro-engine";

export function normalizeDeg(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

/** 1-based house number of `rashiIndex` counted from `ascendantRashiIndex` (whole-sign houses). */
export function houseOfRashi(rashiIndex: number, ascendantRashiIndex: number) {
  return ((rashiIndex - ascendantRashiIndex + 12) % 12) + 1;
}

/** The rashi occupying a given 1-based whole-sign house. */
export function rashiOfHouse(house: number, ascendantRashiIndex: number) {
  return (ascendantRashiIndex + house - 1) % 12;
}

/** 1-based count from one rashi to another, counting the starting sign as 1 (classical convention). */
export function countFrom(fromRashiIndex: number, toRashiIndex: number) {
  return ((toRashiIndex - fromRashiIndex + 12) % 12) + 1;
}

export function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${n % 10 <= 3 ? suffix : "th"}`;
}

/** Movable (chara), fixed (sthira), dual (dwiswabhava) — drives several varga start rules. */
export type Modality = "movable" | "fixed" | "dual";

export function modalityOf(rashiIndex: number): Modality {
  const remainder = rashiIndex % 3;
  return remainder === 0 ? "movable" : remainder === 1 ? "fixed" : "dual";
}

/** Fire / earth / air / water, indexed the same way — used by the D27 start rule and yoga logic. */
export type Element = "fire" | "earth" | "air" | "water";

export function elementOf(rashiIndex: number): Element {
  return (["fire", "earth", "air", "water"] as const)[rashiIndex % 4];
}

export function isOddRashi(rashiIndex: number) {
  // rashiIndex 0 = Mesha = the 1st sign, which is odd.
  return rashiIndex % 2 === 0;
}

/** Formats a decimal degree as D°MM'SS" — the precision a printed kundli is expected to show. */
export function formatDegreeMinuteSecond(degrees: number) {
  const total = Math.abs(degrees);
  const d = Math.floor(total);
  const minutesFloat = (total - d) * 60;
  const m = Math.floor(minutesFloat);
  const s = Math.round((minutesFloat - m) * 60);
  // Carry a rounded-up 60" / 60' rather than printing an impossible value.
  if (s === 60) return `${m + 1 === 60 ? d + 1 : d}°${String(m + 1 === 60 ? 0 : m + 1).padStart(2, "0")}'00"`;
  return `${d}°${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"`;
}
