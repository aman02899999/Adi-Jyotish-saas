import "server-only";

import { GrahaKey, NAKSHATRAS, normalizeDeg } from "@/lib/vedic/core";

/**
 * Vimshottari Dasha — the primary Parashari timing system, and the single thing a Kundli reader
 * reaches for after the chart itself. The 120-year cycle is anchored to the Moon's exact position
 * within its birth nakshatra: the portion of that nakshatra still unelapsed at birth becomes the
 * balance of the first Mahadasha, and every subsequent period follows in fixed cyclic order.
 *
 * Sub-periods are proportional all the way down: an Antardasha of lord B inside a Mahadasha of
 * lord A runs for (A_years × B_years / 120) years, and the same rule recurses for
 * Pratyantardasha. This is exact, not approximate — the arithmetic is closed-form.
 */

/** Fixed Vimshottari cycle: lord order and Mahadasha length in years. Sums to exactly 120. */
export const VIMSHOTTARI_SEQUENCE: { lord: GrahaKey; years: number }[] = [
  { lord: "ketu", years: 7 },
  { lord: "venus", years: 20 },
  { lord: "sun", years: 6 },
  { lord: "moon", years: 10 },
  { lord: "mars", years: 7 },
  { lord: "rahu", years: 18 },
  { lord: "jupiter", years: 16 },
  { lord: "saturn", years: 19 },
  { lord: "mercury", years: 17 },
];

export const VIMSHOTTARI_TOTAL_YEARS = 120;

/**
 * Length of a Vimshottari year in days. Modern Jyotish software (Jagannatha Hora, and the
 * commercial engines that follow it) uses the Gregorian mean year rather than a 360-day savana
 * year; the choice shifts long-range dasha boundaries by months, so it is pinned explicitly here
 * rather than left to a magic number at the call site.
 */
const DAYS_PER_VIMSHOTTARI_YEAR = 365.2425;
const MS_PER_DAY = 86_400_000;

const NAKSHATRA_SPAN = 360 / 27;

function lordIndexForNakshatra(nakshatraIndex: number) {
  return nakshatraIndex % 9;
}

function addYears(from: Date, years: number) {
  return new Date(from.getTime() + years * DAYS_PER_VIMSHOTTARI_YEAR * MS_PER_DAY);
}

export type DashaPeriod = {
  lord: GrahaKey;
  start: Date;
  end: Date;
  years: number;
  /** Nested sub-periods; empty at the deepest requested level. */
  children: DashaPeriod[];
};

/**
 * Builds the sub-periods that subdivide one parent period. The sequence always starts from the
 * parent's own lord and proceeds in the fixed cyclic order, each child taking its share of the
 * parent proportional to its own Mahadasha length.
 */
function buildSubPeriods(parentLord: GrahaKey, parentStart: Date, parentYears: number, depth: number): DashaPeriod[] {
  if (depth <= 0) return [];

  const startIndex = VIMSHOTTARI_SEQUENCE.findIndex((entry) => entry.lord === parentLord);
  const periods: DashaPeriod[] = [];
  let cursor = parentStart;

  for (let step = 0; step < VIMSHOTTARI_SEQUENCE.length; step += 1) {
    const entry = VIMSHOTTARI_SEQUENCE[(startIndex + step) % VIMSHOTTARI_SEQUENCE.length];
    const years = (parentYears * entry.years) / VIMSHOTTARI_TOTAL_YEARS;
    const end = addYears(cursor, years);
    periods.push({
      lord: entry.lord,
      start: cursor,
      end,
      years,
      children: buildSubPeriods(entry.lord, cursor, years, depth - 1),
    });
    cursor = end;
  }

  return periods;
}

export type VimshottariResult = {
  birthNakshatraIndex: number;
  birthNakshatraName: string;
  birthNakshatraLord: GrahaKey;
  /** Fraction of the birth nakshatra already elapsed at birth, 0–1. */
  elapsedFraction: number;
  /** Years of the first Mahadasha still remaining at birth. */
  balanceYears: number;
  balanceLabel: string;
  mahadashas: DashaPeriod[];
};

/**
 * Full Vimshottari tree from the natal Moon.
 *
 * `depth` counts levels *below* Mahadasha: 1 adds Antardasha, 2 adds Pratyantardasha. Three full
 * levels is what a printed kundli shows; going deeper multiplies node count by 9 each time.
 */
export function computeVimshottari(moonSiderealLongitude: number, birthInstant: Date, { depth = 2, cycles = 1 }: { depth?: number; cycles?: number } = {}): VimshottariResult {
  const longitude = normalizeDeg(moonSiderealLongitude);
  const nakshatraIndex = Math.floor(longitude / NAKSHATRA_SPAN);
  const elapsedFraction = (longitude % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;

  const startIndex = lordIndexForNakshatra(nakshatraIndex);
  const firstEntry = VIMSHOTTARI_SEQUENCE[startIndex];
  const balanceYears = firstEntry.years * (1 - elapsedFraction);

  const mahadashas: DashaPeriod[] = [];
  let cursor = birthInstant;

  // The first Mahadasha is truncated to its balance; every later one runs its full length. The
  // notional start of that first period (before birth) is what the sub-period split must be
  // anchored to, otherwise the running Antardasha at birth would be computed against the wrong
  // origin — so it is reconstructed here rather than using the birth instant directly.
  const firstNotionalStart = addYears(birthInstant, -(firstEntry.years * elapsedFraction));
  mahadashas.push({
    lord: firstEntry.lord,
    start: birthInstant,
    end: addYears(birthInstant, balanceYears),
    years: balanceYears,
    children: buildSubPeriods(firstEntry.lord, firstNotionalStart, firstEntry.years, depth),
  });
  cursor = addYears(birthInstant, balanceYears);

  const totalPeriods = VIMSHOTTARI_SEQUENCE.length * cycles;
  for (let step = 1; step < totalPeriods; step += 1) {
    const entry = VIMSHOTTARI_SEQUENCE[(startIndex + step) % VIMSHOTTARI_SEQUENCE.length];
    const end = addYears(cursor, entry.years);
    mahadashas.push({
      lord: entry.lord,
      start: cursor,
      end,
      years: entry.years,
      children: buildSubPeriods(entry.lord, cursor, entry.years, depth),
    });
    cursor = end;
  }

  return {
    birthNakshatraIndex: nakshatraIndex,
    birthNakshatraName: NAKSHATRAS[nakshatraIndex],
    birthNakshatraLord: firstEntry.lord,
    elapsedFraction,
    balanceYears,
    balanceLabel: formatYearsMonthsDays(balanceYears),
    mahadashas,
  };
}

/** Human-readable "Xy Zm Wd" for a fractional-year duration. */
export function formatYearsMonthsDays(years: number) {
  const totalDays = years * DAYS_PER_VIMSHOTTARI_YEAR;
  const y = Math.floor(totalDays / DAYS_PER_VIMSHOTTARI_YEAR);
  const afterYears = totalDays - y * DAYS_PER_VIMSHOTTARI_YEAR;
  const m = Math.floor(afterYears / (DAYS_PER_VIMSHOTTARI_YEAR / 12));
  const d = Math.round(afterYears - m * (DAYS_PER_VIMSHOTTARI_YEAR / 12));
  return [y > 0 ? `${y}y` : null, m > 0 ? `${m}m` : null, `${d}d`].filter(Boolean).join(" ");
}

export type ActiveDasha = { maha: DashaPeriod; antar: DashaPeriod | null; pratyantar: DashaPeriod | null };

/** The Mahadasha/Antardasha/Pratyantardasha running at a given moment — the "where am I now" answer. */
export function activeDashaAt(result: VimshottariResult, at: Date): ActiveDasha | null {
  const time = at.getTime();
  const maha = result.mahadashas.find((period) => period.start.getTime() <= time && time < period.end.getTime());
  if (!maha) return null;
  const antar = maha.children.find((period) => period.start.getTime() <= time && time < period.end.getTime()) ?? null;
  const pratyantar = antar?.children.find((period) => period.start.getTime() <= time && time < period.end.getTime()) ?? null;
  return { maha, antar, pratyantar };
}

/** Flattened Mahadasha→Antardasha rows for table rendering, without the deepest level's bulk. */
export function flattenAntardashas(result: VimshottariResult) {
  return result.mahadashas.flatMap((maha) =>
    maha.children
      // A Mahadasha that was already partly elapsed at birth carries Antardashas that ended
      // before the native was born; those are real cycle positions but meaningless to display.
      .filter((antar) => antar.end.getTime() > result.mahadashas[0].start.getTime())
      .map((antar) => ({ mahaLord: maha.lord, antarLord: antar.lord, start: antar.start, end: antar.end, years: antar.years })),
  );
}
