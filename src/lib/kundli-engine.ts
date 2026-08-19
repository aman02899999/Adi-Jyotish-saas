import "server-only";

import { computeGrahaPositions, ascendantSiderealLongitude, GRAHA_LABELS, GrahaKey, GrahaPosition, NAKSHATRAS, RASHIS, formatDegree } from "@/lib/astro-engine";
import { detectDoshas } from "@/lib/dosha-engine";
import { PlaceNotFoundError, resolveBirthMoment } from "@/lib/geo";

export class KundliEngineError extends Error {}
export { PlaceNotFoundError };

export type KundliChart = {
  name: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  matchedPlace: string;
  positions: GrahaPosition[];
  ascendantRashiIndex: number;
  ascendantDegree: number;
};

export function buildKundliChart({ name, birthDate, birthTime, birthPlace }: {
  name: string; birthDate: string; birthTime: string; birthPlace: string;
}): KundliChart {
  let moment: ReturnType<typeof resolveBirthMoment>;
  try {
    moment = resolveBirthMoment({ birthDate, birthTime, birthPlace });
  } catch (error) {
    if (error instanceof PlaceNotFoundError) throw new KundliEngineError(error.message);
    throw error;
  }

  const positions = computeGrahaPositions(moment.utcInstant);
  const ascendantLongitude = ascendantSiderealLongitude(moment.utcInstant, moment.place.lat, moment.place.lon);

  return {
    name, birthDate, birthTime, birthPlace,
    matchedPlace: moment.place.matchedName,
    positions,
    ascendantRashiIndex: Math.floor(ascendantLongitude / 30),
    ascendantDegree: ascendantLongitude % 30,
  };
}

const GRAHA_KEYWORDS: Record<GrahaKey, string> = {
  sun: "leadership, vitality, and self-expression",
  moon: "emotional needs and instinct",
  mars: "drive, courage, and initiative",
  mercury: "communication and analytical thinking",
  jupiter: "wisdom, growth, and optimism",
  venus: "relationships, beauty, and harmony",
  saturn: "discipline, structure, and long-term responsibility",
  rahu: "ambition and unconventional drive",
  ketu: "detachment and inward reflection",
};

function houseOf(chart: KundliChart, rashiIndex: number) {
  return ((rashiIndex - chart.ascendantRashiIndex + 12) % 12) + 1;
}

function occupantsOfHouse(chart: KundliChart, house: number) {
  const houseRashiIndex = (chart.ascendantRashiIndex + house - 1) % 12;
  return chart.positions.filter((position) => position.rashiIndex === houseRashiIndex);
}

export type KundliHouseOccupant = { graha: GrahaKey; isRetrograde: boolean };
export type KundliHouse = { house: number; rashiIndex: number; occupants: KundliHouseOccupant[] };

/** The 12 houses (Lagna first) with the rashi and planets occupying each — the plain-data shape a chart diagram renders. */
export function buildHouseGrid(chart: KundliChart): KundliHouse[] {
  return Array.from({ length: 12 }, (_, index) => {
    const house = index + 1;
    return { house, rashiIndex: (chart.ascendantRashiIndex + index) % 12, occupants: occupantsOfHouse(chart, house).map((position) => ({ graha: position.graha, isRetrograde: position.isRetrograde })) };
  });
}

function joinWithAnd(items: string[]) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function describeOccupants(occupants: GrahaPosition[], emptyFallback: string) {
  if (!occupants.length) return emptyFallback;
  const names = occupants.map((position) => GRAHA_LABELS[position.graha]);
  const keywords = Array.from(new Set(occupants.map((position) => GRAHA_KEYWORDS[position.graha])));
  return `${joinWithAnd(names)} ${occupants.length > 1 ? "sit" : "sits"} here, bringing themes of ${joinWithAnd(keywords)}.`;
}

function placementLine(position: GrahaPosition) {
  const retrograde = position.isRetrograde ? " (retrograde)" : "";
  return `${GRAHA_LABELS[position.graha]} is in ${RASHIS[position.rashiIndex].name} (${formatDegree(position.longitude)}), ${NAKSHATRAS[position.nakshatraIndex]} nakshatra, pada ${position.pada}${retrograde}`;
}

export function renderKundliReport(chart: KundliChart): string {
  const moon = chart.positions.find((p) => p.graha === "moon")!;
  const sun = chart.positions.find((p) => p.graha === "sun")!;
  const venus = chart.positions.find((p) => p.graha === "venus")!;
  const ascendantRashi = RASHIS[chart.ascendantRashiIndex];

  const overview = [
    `Overview:`,
    `${chart.name}, born ${chart.birthDate} at ${chart.birthTime} in ${chart.matchedPlace}, has ${ascendantRashi.name} rising (Lagna at ${formatDegree(chart.ascendantDegree)}) — this is the lens through which you meet the world. Your Moon sits in ${RASHIS[moon.rashiIndex].name}, ${NAKSHATRAS[moon.nakshatraIndex]} nakshatra — your instinctive, emotional nature. Your Sun is in ${RASHIS[sun.rashiIndex].name} — the core purpose you're steadily growing toward.`,
    `Together, these three placements — rising sign, Moon, and Sun — are the foundation classical Jyotish reads first. Everything below builds on them.`,
  ].join("\n\n");

  const career = [
    `Career & Purpose:`,
    `Your 10th house of career and public standing falls in ${RASHIS[(chart.ascendantRashiIndex + 9) % 12].name}. ${describeOccupants(occupantsOfHouse(chart, 10), "No planet sits directly in this house right now, so its themes are shaped more by its ruling sign than by a strong planetary presence.")}`,
  ].join("\n\n");

  const relationships = [
    `Relationships:`,
    `Your 7th house of partnership falls in ${RASHIS[(chart.ascendantRashiIndex + 6) % 12].name}. ${describeOccupants(occupantsOfHouse(chart, 7), "No planet sits directly in this house, so partnership themes lean on its ruling sign's natural temperament.")} Venus, the natural signifier of relationships, sits in your ${houseOf(chart, venus.rashiIndex)}${ordinalSuffix(houseOf(chart, venus.rashiIndex))} house (${RASHIS[venus.rashiIndex].name}) — worth weighing alongside the 7th house itself.`,
  ].join("\n\n");

  const health = [
    `Health & Wellbeing:`,
    `Your 6th house (daily routine, health) falls in ${RASHIS[(chart.ascendantRashiIndex + 5) % 12].name}: ${describeOccupants(occupantsOfHouse(chart, 6), "no planet occupies it directly.")} Your 8th house (resilience, transformation) falls in ${RASHIS[(chart.ascendantRashiIndex + 7) % 12].name}: ${describeOccupants(occupantsOfHouse(chart, 8), "no planet occupies it directly.")} As with all Jyotish health indicators, treat this as a symbolic lens, never medical guidance.`,
  ].join("\n\n");

  const wealth = [
    `Wealth & Guidance:`,
    `Your 2nd house (accumulated wealth, family) falls in ${RASHIS[(chart.ascendantRashiIndex + 1) % 12].name}: ${describeOccupants(occupantsOfHouse(chart, 2), "no planet occupies it directly.")} Your 11th house (gains, aspirations) falls in ${RASHIS[(chart.ascendantRashiIndex + 10) % 12].name}: ${describeOccupants(occupantsOfHouse(chart, 11), "no planet occupies it directly.")}`,
    `A grounded next step: revisit this chart with a practitioner for a full dasha (planetary period) reading — the houses above set the stage, but timing is where Jyotish gets specific.`,
  ].join("\n\n");

  const doshas = renderDoshaSection(chart);

  const positionsTable = chart.positions.map(placementLine).join("\n");
  const positionsSection = [`Planetary Positions:`, positionsTable].join("\n\n");

  return [overview, career, relationships, health, wealth, doshas, positionsSection].join("\n\n");
}

function renderDoshaSection(chart: KundliChart): string {
  const { mangal, kaalSarp, sadeSati } = detectDoshas(chart);

  const mangalLine = mangal.present
    ? mangal.cancelled
      ? `Mangal Dosha (Manglik): present but classically cancelled — Mars is in house ${mangal.houseFromLagna} from Lagna, and ${mangal.cancellationReason}`
      : `Mangal Dosha (Manglik): present — Mars is in house ${mangal.houseFromLagna} from Lagna${mangal.presentFromMoon && mangal.houseFromMoon !== mangal.houseFromLagna ? ` (and house ${mangal.houseFromMoon} from Moon)` : ""}. Traditionally weighed in marriage matching. Only the own-sign/exaltation cancellation is checked here — other classical cancellation conditions exist, so treat this as a starting point, not a final word.`
    : `Mangal Dosha (Manglik): not present — Mars does not occupy a Mangal Dosha house from Lagna or Moon.`;

  const kaalSarpLine = kaalSarp.present
    ? `Kaal Sarp Dosha: present (${kaalSarp.name}) — all seven classical planets fall on one side of the Rahu-Ketu axis.`
    : `Kaal Sarp Dosha: not present — the seven classical planets are not fully hemmed between Rahu and Ketu.`;

  const sadeSatiLine = sadeSati.active
    ? `Sade Sati: currently active, ${sadeSati.phase === "rising" ? "rising phase (first phase)" : sadeSati.phase === "peak" ? "peak phase (second phase)" : "setting phase (third phase)"} — transiting Saturn is in ${sadeSati.currentSaturnRashi}, relative to your natal Moon in ${sadeSati.natalMoonRashi}.`
    : `Sade Sati: not currently active — transiting Saturn (${sadeSati.currentSaturnRashi}) is not in the 12th, 1st, or 2nd house from your natal Moon (${sadeSati.natalMoonRashi}).`;

  return [
    `Doshas:`,
    [mangalLine, kaalSarpLine, sadeSatiLine].join("\n\n"),
    `This is traditional Parashari guidance calculated from your actual chart, not a scientific or guaranteed prediction — for major life decisions, always cross-check with a qualified practitioner.`,
  ].join("\n\n");
}

function ordinalSuffix(n: number) {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}
