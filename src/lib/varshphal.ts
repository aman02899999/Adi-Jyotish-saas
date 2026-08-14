import "server-only";

import { computeGrahaPositions, GRAHA_LABELS, type GrahaKey, NAKSHATRAS, RASHIS, ascendantSiderealLongitude, formatDegree, siderealLongitudeOf } from "@/lib/astro-engine";
import { PlaceNotFoundError, resolvePlaceToCoordinates } from "@/lib/geo";
import { civilToUtc } from "@/lib/scheduling";

export class VarshphalError extends Error {}
export { PlaceNotFoundError };

const SUN_MEAN_DAILY_MOTION_DEG = 0.9856;

function angularDelta(target: number, current: number) {
  let delta = target - current;
  delta = ((delta + 180) % 360 + 360) % 360 - 180; // shortest signed distance, -180..180
  return delta;
}

/** Finds the exact UTC instant this year when the transiting Sun returns to its natal sidereal
 * longitude — the classical "Varshphal" moment. The Sun's near-constant daily motion (~0.9856°)
 * makes this converge in a handful of iterations, so a numerical search is used instead of a
 * closed-form formula. Starting from the birthday's calendar date (this year) is an excellent seed
 * — the sidereal return date drifts from the Gregorian birthday by well under a day, even across
 * decades of ayanamsha precession. */
function findSolarReturnMoment(natalSunLongitude: number, birthMonth: number, birthDay: number, year: number): Date {
  let guess = new Date(Date.UTC(year, birthMonth - 1, birthDay, 12));
  for (let iteration = 0; iteration < 12; iteration++) {
    const currentLongitude = siderealLongitudeOf(guess, "sun");
    const delta = angularDelta(natalSunLongitude, currentLongitude);
    if (Math.abs(delta) < 0.0002) break;
    const daysAdjust = delta / SUN_MEAN_DAILY_MOTION_DEG;
    guess = new Date(guess.getTime() + daysAdjust * 86_400_000);
  }
  return guess;
}

export type VarshphalChart = {
  year: number;
  returnMoment: Date;
  matchedPlace: string;
  positions: ReturnType<typeof computeGrahaPositions>;
  ascendantRashiIndex: number;
  ascendantDegree: number;
};

export function buildVarshphalChart({ birthDate, birthTime, birthPlace, year }: {
  birthDate: string; birthTime: string; birthPlace: string; year: number;
}): VarshphalChart {
  const place = resolvePlaceToCoordinates(birthPlace);
  if (!place) throw new VarshphalError(`We couldn't recognize "${birthPlace}" — please update your birth place and try again.`);

  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  if (!birthYear || !birthMonth || !birthDay) throw new VarshphalError("Your saved birth date looks invalid — please update your birth profile.");

  // Natal Sun longitude anchors the search — computed from the actual birth moment (civil time
  // converted through the birth place's real timezone, same as the core Kundli engine), not by
  // treating the local clock time as if it were already UTC. The Sun moves under 1° across an
  // entire day, so even a few hours of timezone error here shifts the search's seed only slightly
  // — but the search converges on the Sun's *exact* longitude regardless, and it's the return
  // instant (and therefore the return Lagna, which moves ~15°/hour) that inherits the same
  // timezone error if the natal anchor itself is wrong.
  const birthUtc = civilToUtc(birthDate, birthTime || "12:00", place.timezone);
  const natalSunLongitude = siderealLongitudeOf(birthUtc, "sun");

  const returnMoment = findSolarReturnMoment(natalSunLongitude, birthMonth, birthDay, year);
  const positions = computeGrahaPositions(returnMoment);
  const ascendantLongitude = ascendantSiderealLongitude(returnMoment, place.lat, place.lon);

  return {
    year,
    returnMoment,
    matchedPlace: place.matchedName,
    positions,
    ascendantRashiIndex: Math.floor(ascendantLongitude / 30),
    ascendantDegree: ascendantLongitude % 30,
  };
}

// Classical rulership of each rashi — used here to name the Varshphal Lagna's ruling planet
// (a simplified stand-in for the full Panchvargiya Bala "Varshesh" calculation, which weighs five
// separate dignities; naming the return-Lagna's lord is a real, commonly used simplification, not
// the complete classical method).
const RASHI_LORDS: GrahaKey[] = [
  "mars", "venus", "mercury", "moon", "sun", "mercury",
  "venus", "mars", "jupiter", "saturn", "saturn", "jupiter",
];

const VARSHESH_THEMES: Partial<Record<GrahaKey, string>> = {
  sun: "a year that rewards visibility — stepping up, being seen, and leading from the front.",
  moon: "a year led by instinct and emotional tides — trust your gut more than usual, and expect your mood to shape your momentum.",
  mars: "an active, fast-moving year — courage and quick decisions serve you better than long deliberation.",
  mercury: "a year of communication, learning, and movement — deals, messages, and short trips carry unusual weight.",
  jupiter: "a genuinely fortunate year — growth, generosity, and expanding opportunity are the year's throughline.",
  venus: "a year centered on relationships, beauty, and comfort — what you build in partnership matters more than what you build alone.",
  saturn: "a year that asks for discipline — slow, structural progress rather than quick wins, but what you build now tends to last.",
};

function ordinalSuffix(n: number) {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

function houseOf(chart: VarshphalChart, rashiIndex: number) {
  return ((rashiIndex - chart.ascendantRashiIndex + 12) % 12) + 1;
}

function occupantsOfHouse(chart: VarshphalChart, house: number) {
  const houseRashiIndex = (chart.ascendantRashiIndex + house - 1) % 12;
  return chart.positions.filter((position) => position.rashiIndex === houseRashiIndex);
}

function describeOccupants(occupants: ReturnType<typeof computeGrahaPositions>, emptyFallback: string) {
  if (!occupants.length) return emptyFallback;
  const names = occupants.map((position) => GRAHA_LABELS[position.graha]);
  return `${names.join(occupants.length > 1 ? " and " : "")} ${occupants.length > 1 ? "sit" : "sits"} here this year.`;
}

export function renderVarshphalReport(chart: VarshphalChart, name: string): string {
  const sun = chart.positions.find((p) => p.graha === "sun")!;
  const moon = chart.positions.find((p) => p.graha === "moon")!;
  const ascendantRashi = RASHIS[chart.ascendantRashiIndex];
  const varshesh = RASHI_LORDS[chart.ascendantRashiIndex];
  const returnDateLabel = chart.returnMoment.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  const overview = [
    `Overview:`,
    `${name}, your Sun returned to its exact natal position on ${returnDateLabel} — the moment that opens your Varshphal (annual) chart for ${chart.year}, cast for ${chart.matchedPlace}. This year's rising sign is ${ascendantRashi.name} (Lagna at ${formatDegree(chart.ascendantDegree)}), and your Varshphal Moon sits in ${RASHIS[moon.rashiIndex].name}.`,
    `The Varshesh — this year's ruling planet, the lord of the Varshphal Lagna — is ${GRAHA_LABELS[varshesh]}. ${VARSHESH_THEMES[varshesh] ?? ""}`,
  ].join("\n\n");

  const career = [
    `Career & Public Life:`,
    `This year's 10th house of career and standing falls in ${RASHIS[(chart.ascendantRashiIndex + 9) % 12].name}. ${describeOccupants(occupantsOfHouse(chart, 10), "No planet occupies it directly this year, so its themes lean on its ruling sign's temperament.")}`,
  ].join("\n\n");

  const relationships = [
    `Relationships:`,
    `This year's 7th house of partnership falls in ${RASHIS[(chart.ascendantRashiIndex + 6) % 12].name}. ${describeOccupants(occupantsOfHouse(chart, 7), "No planet occupies it directly this year.")}`,
  ].join("\n\n");

  const wealth = [
    `Wealth & Growth:`,
    `This year's 2nd house (income) falls in ${RASHIS[(chart.ascendantRashiIndex + 1) % 12].name}: ${describeOccupants(occupantsOfHouse(chart, 2), "no planet occupies it directly.")} The 11th house (gains) falls in ${RASHIS[(chart.ascendantRashiIndex + 10) % 12].name}: ${describeOccupants(occupantsOfHouse(chart, 11), "no planet occupies it directly.")}`,
    `A grounded next step: pair this yearly outlook with a live consultation once a specific decision comes up — Varshphal sets the year's tone, a practitioner can speak to its exact timing.`,
  ].join("\n\n");

  const positionsTable = chart.positions.map((position) => `${GRAHA_LABELS[position.graha]} is in ${RASHIS[position.rashiIndex].name} (${formatDegree(position.longitude)}), ${NAKSHATRAS[position.nakshatraIndex]} nakshatra, this year's ${houseOf(chart, position.rashiIndex)}${ordinalSuffix(houseOf(chart, position.rashiIndex))} house`).join("\n");
  const positionsSection = [`This Year's Planetary Positions:`, positionsTable].join("\n\n");

  return [overview, career, relationships, wealth, positionsSection].join("\n\n");
}
