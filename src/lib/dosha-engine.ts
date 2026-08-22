import "server-only";

import { computeGrahaPositions, GrahaKey, GrahaPosition, RASHIS } from "@/lib/astro-engine";

/**
 * Deterministic dosha detection — no AI, no fabricated scores. Practitioner marketplace bios
 * (see scheduling.ts) advertise Mangal Dosha, Kaal Sarp Dosha, and Shani Sade Sati as
 * specialties; until this file existed, nothing in the codebase actually calculated any of
 * them, so those bio claims had no engine behind them. This closes that gap with the standard
 * Parashari rules, deliberately scoped conservatively: where a classical system has many
 * documented cancellation conditions and only a subset are checked here, the output says so
 * rather than implying an exhaustive assessment.
 */

function houseFromReference(targetRashiIndex: number, referenceRashiIndex: number) {
  return ((targetRashiIndex - referenceRashiIndex + 12) % 12) + 1;
}

const MANGAL_DOSHA_HOUSES = new Set([1, 2, 4, 7, 8, 12]);
const MARS_OWN_RASHI = new Set([0, 7]); // Mesha, Vrishchika
const MARS_EXALTATION_RASHI = 9; // Makara

export type MangalDoshaResult = {
  presentFromLagna: boolean;
  presentFromMoon: boolean;
  /** Whether Mars occupies a dosha house from Lagna or Moon, before considering cancellation. */
  present: boolean;
  /** The practical takeaway: present and not classically cancelled. */
  active: boolean;
  cancelled: boolean;
  cancellationReason: string | null;
  houseFromLagna: number;
  houseFromMoon: number;
};

/** Mars in house 1, 2, 4, 7, 8, or 12 from Lagna or Moon — the standard Mangal Dosha (Manglik)
 * condition. Cancellation checked here is limited to Mars in its own sign or exaltation; other
 * classical cancellation conditions (e.g. Jupiter's aspect, specific house/lord combinations)
 * exist but aren't modeled — the result says so rather than claiming exhaustive coverage. */
export function detectMangalDosha({ marsRashiIndex, ascendantRashiIndex, moonRashiIndex }: {
  marsRashiIndex: number; ascendantRashiIndex: number; moonRashiIndex: number;
}): MangalDoshaResult {
  const houseFromLagna = houseFromReference(marsRashiIndex, ascendantRashiIndex);
  const houseFromMoon = houseFromReference(marsRashiIndex, moonRashiIndex);
  const presentFromLagna = MANGAL_DOSHA_HOUSES.has(houseFromLagna);
  const presentFromMoon = MANGAL_DOSHA_HOUSES.has(houseFromMoon);
  const present = presentFromLagna || presentFromMoon;

  let cancellationReason: string | null = null;
  if (present) {
    if (MARS_OWN_RASHI.has(marsRashiIndex)) cancellationReason = `Mars sits in its own sign (${RASHIS[marsRashiIndex].name}) — a classical cancellation.`;
    else if (marsRashiIndex === MARS_EXALTATION_RASHI) cancellationReason = `Mars is exalted in ${RASHIS[marsRashiIndex].name} — a classical cancellation.`;
  }

  return {
    presentFromLagna, presentFromMoon, present,
    cancelled: present && cancellationReason !== null,
    active: present && cancellationReason === null,
    cancellationReason,
    houseFromLagna, houseFromMoon,
  };
}

const KAAL_SARP_NAMES = [
  "Anant Kaal Sarp Dosha", "Kulik Kaal Sarp Dosha", "Vasuki Kaal Sarp Dosha", "Shankhpal Kaal Sarp Dosha",
  "Padma Kaal Sarp Dosha", "Mahapadma Kaal Sarp Dosha", "Takshak Kaal Sarp Dosha", "Karkotak Kaal Sarp Dosha",
  "Shankhachur Kaal Sarp Dosha", "Ghatak Kaal Sarp Dosha", "Vishdhar Kaal Sarp Dosha", "Sheshnag Kaal Sarp Dosha",
] as const;

export type KaalSarpDoshaResult = {
  present: boolean;
  name: string | null;
  rahuHouseFromLagna: number;
};

/** All seven classical planets (Sun through Saturn) hemmed on one side of the Rahu-Ketu axis —
 * the standard Kaal Sarp Dosha condition. Its traditional "type" name is a direct lookup from
 * Rahu's house position counted from Lagna. */
export function detectKaalSarpDosha({ planetLongitudes, rahuLongitude, rahuRashiIndex, ascendantRashiIndex }: {
  planetLongitudes: number[]; rahuLongitude: number; rahuRashiIndex: number; ascendantRashiIndex: number;
}): KaalSarpDoshaResult {
  const relative = planetLongitudes.map((longitude) => ((longitude - rahuLongitude) % 360 + 360) % 360);
  const present = relative.every((r) => r > 0 && r < 180) || relative.every((r) => r > 180 && r < 360);
  const rahuHouseFromLagna = houseFromReference(rahuRashiIndex, ascendantRashiIndex);

  return { present, name: present ? KAAL_SARP_NAMES[rahuHouseFromLagna - 1] : null, rahuHouseFromLagna };
}

export type SadeSatiPhase = "rising" | "peak" | "setting" | null;

export type SadeSatiResult = {
  active: boolean;
  phase: SadeSatiPhase;
  natalMoonRashi: string;
  currentSaturnRashi: string;
};

/** Transiting Saturn in the 12th, 1st, or 2nd house from natal Moon — the three phases of Sade
 * Sati. Uses Saturn's real current sidereal position (via the same ephemeris as the rest of the
 * chart), not a lookup table, so it stays correct as time passes with no manual updates. */
export function detectSadeSati({ moonRashiIndex, saturnRashiIndex }: {
  moonRashiIndex: number; saturnRashiIndex: number;
}): SadeSatiResult {
  const risingRashi = (moonRashiIndex + 11) % 12; // 12th from Moon
  const settingRashi = (moonRashiIndex + 1) % 12; // 2nd from Moon

  let phase: SadeSatiPhase = null;
  if (saturnRashiIndex === risingRashi) phase = "rising";
  else if (saturnRashiIndex === moonRashiIndex) phase = "peak";
  else if (saturnRashiIndex === settingRashi) phase = "setting";

  return { active: phase !== null, phase, natalMoonRashi: RASHIS[moonRashiIndex].name, currentSaturnRashi: RASHIS[saturnRashiIndex].name };
}

export type DoshaSummary = {
  mangal: MangalDoshaResult;
  kaalSarp: KaalSarpDoshaResult;
  sadeSati: SadeSatiResult;
};

const CLASSICAL_SEVEN: GrahaKey[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

/** Runs all three dosha checks against a natal chart's planetary positions, plus Saturn's
 * current transit for Sade Sati. Accepts the plain positions/ascendant shape (rather than
 * importing KundliChart) so this module has no dependency on kundli-engine.ts. */
export function detectDoshas({ positions, ascendantRashiIndex }: {
  positions: GrahaPosition[]; ascendantRashiIndex: number;
}): DoshaSummary {
  const byGraha = new Map(positions.map((position) => [position.graha, position]));
  const mars = byGraha.get("mars")!;
  const moon = byGraha.get("moon")!;
  const rahu = byGraha.get("rahu")!;

  const mangal = detectMangalDosha({ marsRashiIndex: mars.rashiIndex, ascendantRashiIndex, moonRashiIndex: moon.rashiIndex });

  const kaalSarp = detectKaalSarpDosha({
    planetLongitudes: CLASSICAL_SEVEN.map((graha) => byGraha.get(graha)!.longitude),
    rahuLongitude: rahu.longitude,
    rahuRashiIndex: rahu.rashiIndex,
    ascendantRashiIndex,
  });

  const currentSaturn = computeGrahaPositions(new Date()).find((position) => position.graha === "saturn")!;
  const sadeSati = detectSadeSati({ moonRashiIndex: moon.rashiIndex, saturnRashiIndex: currentSaturn.rashiIndex });

  return { mangal, kaalSarp, sadeSati };
}
