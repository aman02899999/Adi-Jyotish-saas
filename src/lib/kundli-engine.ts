import "server-only";

import { ayanamsha } from "panchanga";
import { computeGrahaPositions, ascendantSiderealLongitude, sunriseSunset, GRAHA_LABELS, GrahaKey, GrahaPosition, NAKSHATRAS, RASHIS, formatDegree } from "@/lib/astro-engine";
import { detectDoshas } from "@/lib/dosha-engine";
import { PlaceNotFoundError, resolveBirthMoment } from "@/lib/geo";
import { computeAspects, describeAspect, type Aspect } from "@/lib/vedic/aspects";
import { computeAshtakavarga, type AshtakavargaResult } from "@/lib/vedic/ashtakavarga";
import { computeBirthPanchang, namaAksharaOf, type BirthPanchang } from "@/lib/vedic/birth-panchang";
import { houseOfRashi, ordinal } from "@/lib/vedic/core";
import { buildDignityTable, detectPlanetaryWars, RASHI_LORDS, type GrahaDignityDetail, type PlanetaryWar } from "@/lib/vedic/dignity";
import { buildVargaCharts, VARGA_META, type VargaChart, type VargaKey } from "@/lib/vedic/varga";
import { activeDashaAt, computeVimshottari, formatYearsMonthsDays, type ActiveDasha, type VimshottariResult } from "@/lib/vedic/vimshottari";
import { detectYogas, type Yoga } from "@/lib/vedic/yogas";

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
  /** Full 0–360° sidereal ascendant — needed to derive divisional-chart ascendants. */
  ascendantLongitude: number;
  /** The exact UTC instant of birth, after timezone resolution. */
  birthInstant: Date;
  latitude: number;
  longitude: number;
  timezone: string;
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
    ascendantLongitude,
    birthInstant: moment.utcInstant,
    latitude: moment.place.lat,
    longitude: moment.place.lon,
    timezone: moment.place.timezone,
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

/** What each of the twelve bhavas governs — used to label houses throughout the report. */
export const HOUSE_SIGNIFICATIONS: string[] = [
  "Self, body, temperament (Tanu Bhava)",
  "Wealth, family, speech (Dhana Bhava)",
  "Courage, siblings, effort (Sahaja Bhava)",
  "Home, mother, inner peace (Sukha Bhava)",
  "Intellect, children, creativity (Putra Bhava)",
  "Health, obstacles, service (Ari Bhava)",
  "Partnership, marriage (Yuvati Bhava)",
  "Transformation, longevity (Randhra Bhava)",
  "Fortune, dharma, higher learning (Dharma Bhava)",
  "Career, status, action (Karma Bhava)",
  "Gains, networks, aspirations (Labha Bhava)",
  "Loss, seclusion, liberation (Vyaya Bhava)",
];

function houseOf(chart: KundliChart, rashiIndex: number) {
  return houseOfRashi(rashiIndex, chart.ascendantRashiIndex);
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

export type HouseLordDetail = {
  house: number;
  rashiIndex: number;
  rashiName: string;
  signification: string;
  lord: GrahaKey;
  lordRashiIndex: number;
  lordHouse: number;
  occupants: GrahaKey[];
};

/**
 * Bhava lords and where each one sits. "Which house does the lord of house X occupy" is the single
 * most-used analytical move in Parashari reading, and it was entirely absent from the old report.
 */
export function buildHouseLords(chart: KundliChart): HouseLordDetail[] {
  return Array.from({ length: 12 }, (_, index) => {
    const house = index + 1;
    const rashiIndex = (chart.ascendantRashiIndex + index) % 12;
    const lord = RASHI_LORDS[rashiIndex];
    const lordPosition = chart.positions.find((position) => position.graha === lord)!;
    return {
      house,
      rashiIndex,
      rashiName: RASHIS[rashiIndex].name,
      signification: HOUSE_SIGNIFICATIONS[index],
      lord,
      lordRashiIndex: lordPosition.rashiIndex,
      lordHouse: houseOf(chart, lordPosition.rashiIndex),
      occupants: occupantsOfHouse(chart, house).map((position) => position.graha),
    };
  });
}

/** The sixteen divisional charts computed for a full reading, in classical order. */
export const FULL_VARGA_SET: VargaKey[] = ["D1", "D2", "D3", "D4", "D7", "D9", "D10", "D12", "D16", "D20", "D24", "D27", "D30", "D40", "D45", "D60"];

export type DetailedKundli = {
  chart: KundliChart;
  houses: KundliHouse[];
  houseLords: HouseLordDetail[];
  panchang: BirthPanchang;
  namaAkshara: string;
  /** Lahiri ayanamsa in degrees at the birth moment — printed on every professional Kundli. */
  ayanamsaDegrees: number;
  sunrise: Date | null;
  sunset: Date | null;
  dignities: GrahaDignityDetail[];
  planetaryWars: PlanetaryWar[];
  aspects: Aspect[];
  yogas: Yoga[];
  doshas: ReturnType<typeof detectDoshas>;
  vimshottari: VimshottariResult;
  currentDasha: ActiveDasha | null;
  ashtakavarga: AshtakavargaResult;
  vargas: VargaChart[];
};

/**
 * The complete analytical Kundli: everything a printed janma-patrika carries, computed from the
 * real ephemeris rather than templated.
 *
 * This is deliberately a separate entry point from buildKundliChart() — the lightweight chart is
 * all several callers (the profile validator, the shareable card) need, and computing sixteen
 * divisional charts plus a full Vimshottari tree for those would be wasted work.
 */
export function buildDetailedKundli(chart: KundliChart, { asOf = new Date(), vargas = FULL_VARGA_SET }: { asOf?: Date; vargas?: VargaKey[] } = {}): DetailedKundli {
  const moon = chart.positions.find((position) => position.graha === "moon")!;
  const sun = chart.positions.find((position) => position.graha === "sun")!;
  const vimshottari = computeVimshottari(moon.longitude, chart.birthInstant, { depth: 2 });
  const { sunrise, sunset } = sunriseSunset(chart.birthInstant, chart.latitude, chart.longitude);

  return {
    chart,
    houses: buildHouseGrid(chart),
    houseLords: buildHouseLords(chart),
    panchang: computeBirthPanchang({
      birthInstant: chart.birthInstant,
      latitude: chart.latitude,
      longitude: chart.longitude,
      timeZone: chart.timezone,
      moonLongitude: moon.longitude,
      sunLongitude: sun.longitude,
    }),
    namaAkshara: namaAksharaOf(moon.longitude),
    ayanamsaDegrees: ayanamsha(chart.birthInstant, { nutation: true }),
    sunrise,
    sunset,
    dignities: buildDignityTable(chart.positions),
    planetaryWars: detectPlanetaryWars(chart.positions),
    aspects: computeAspects(chart.positions, chart.ascendantRashiIndex),
    yogas: detectYogas(chart.positions, chart.ascendantRashiIndex),
    doshas: detectDoshas(chart),
    vimshottari,
    currentDasha: activeDashaAt(vimshottari, asOf),
    ashtakavarga: computeAshtakavarga(chart.positions, chart.ascendantRashiIndex),
    vargas: buildVargaCharts(chart.positions, chart.ascendantLongitude, vargas),
  };
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

function placementLine(position: GrahaPosition, dignity: GrahaDignityDetail | undefined, ascendantRashiIndex: number) {
  const flags = [
    position.isRetrograde ? "retrograde" : null,
    dignity?.combust ? "combust" : null,
    dignity && dignity.dignity !== "neutral" ? dignity.dignityLabel.toLowerCase() : null,
  ].filter(Boolean);
  const suffix = flags.length ? ` — ${flags.join(", ")}` : "";
  return `${GRAHA_LABELS[position.graha]}: ${RASHIS[position.rashiIndex].name} ${formatDegree(position.longitude)}, house ${houseOfRashi(position.rashiIndex, ascendantRashiIndex)}, ${NAKSHATRAS[position.nakshatraIndex]} pada ${position.pada}${suffix}`;
}

function formatDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: timezone }).format(date);
}

/**
 * The full narrative Kundli report.
 *
 * Section headings emitted here are mirrored in kundli-pdf.ts's NARRATIVE_HEADINGS, so the PDF and
 * the on-site reading never drift apart — adding a section here means adding it there too.
 */
export function renderKundliReport(chart: KundliChart, asOf = new Date()): string {
  const detailed = buildDetailedKundli(chart, { asOf });
  const { panchang, dignities, vimshottari, currentDasha, ashtakavarga, yogas, houseLords } = detailed;

  const moon = chart.positions.find((p) => p.graha === "moon")!;
  const sun = chart.positions.find((p) => p.graha === "sun")!;
  const venus = chart.positions.find((p) => p.graha === "venus")!;
  const ascendantRashi = RASHIS[chart.ascendantRashiIndex];
  const dignityOf = (graha: GrahaKey) => dignities.find((entry) => entry.graha === graha);

  const birthDetails = [
    `Birth Details:`,
    [
      `Name: ${chart.name}`,
      `Date: ${chart.birthDate}    Time: ${chart.birthTime}`,
      `Place: ${chart.matchedPlace} (${chart.latitude.toFixed(4)}°, ${chart.longitude.toFixed(4)}°)`,
      `Timezone: ${chart.timezone}`,
      `Ayanamsa: Lahiri (Chitrapaksha) ${detailed.ayanamsaDegrees.toFixed(4)}°`,
      detailed.sunrise ? `Sunrise: ${new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: chart.timezone }).format(detailed.sunrise)}` : null,
      detailed.sunset ? `Sunset: ${new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: chart.timezone }).format(detailed.sunset)}` : null,
    ].filter(Boolean).join("\n"),
  ].join("\n\n");

  const panchangSection = [
    `Birth Panchang:`,
    [
      `Tithi: ${panchang.tithiName} (${panchang.paksha})`,
      `Vara (weekday): ${panchang.varaName}`,
      `Nakshatra: ${panchang.nakshatraName}, pada ${panchang.nakshatraPada} — lord ${GRAHA_LABELS[panchang.nakshatraLord]}, deity ${panchang.nakshatraDeity}`,
      `Yoga: ${panchang.yogaName}`,
      `Karana: ${panchang.karanaName}`,
      `Gana: ${panchang.gana}    Yoni: ${panchang.yoni}    Nadi: ${panchang.nadi}`,
      `Chandra Rashi (Moon sign): ${panchang.moonRashiName}    Surya Rashi (Sun sign): ${panchang.sunRashiName}`,
      `Nama-akshara (traditional naming syllable): ${detailed.namaAkshara}`,
    ].join("\n"),
  ].join("\n\n");

  const overview = [
    `Overview:`,
    `${chart.name}, born ${chart.birthDate} at ${chart.birthTime} in ${chart.matchedPlace}, has ${ascendantRashi.name} rising (Lagna at ${formatDegree(chart.ascendantDegree)}) — this is the lens through which you meet the world. Your Moon sits in ${RASHIS[moon.rashiIndex].name}, ${NAKSHATRAS[moon.nakshatraIndex]} nakshatra — your instinctive, emotional nature. Your Sun is in ${RASHIS[sun.rashiIndex].name} — the core purpose you're steadily growing toward.`,
    `Together, these three placements — rising sign, Moon, and Sun — are the foundation classical Jyotish reads first. Everything below builds on them.`,
  ].join("\n\n");

  const dashaSection = [
    `Dasha (Planetary Periods):`,
    `Your Vimshottari dasha begins from ${panchang.nakshatraName} nakshatra, ruled by ${GRAHA_LABELS[vimshottari.birthNakshatraLord]}. At birth, ${formatYearsMonthsDays(vimshottari.balanceYears)} of that ${GRAHA_LABELS[vimshottari.birthNakshatraLord]} mahadasha remained.`,
    currentDasha
      ? `Running now: ${GRAHA_LABELS[currentDasha.maha.lord]} mahadasha (${formatDate(currentDasha.maha.start, chart.timezone)} – ${formatDate(currentDasha.maha.end, chart.timezone)})${currentDasha.antar ? `, ${GRAHA_LABELS[currentDasha.antar.lord]} antardasha (${formatDate(currentDasha.antar.start, chart.timezone)} – ${formatDate(currentDasha.antar.end, chart.timezone)})` : ""}${currentDasha.pratyantar ? `, ${GRAHA_LABELS[currentDasha.pratyantar.lord]} pratyantardasha` : ""}. This is the timing layer — the same placement reads very differently depending on whose period is running.`
      : `The dasha sequence computed here spans 120 years from birth.`,
    `Upcoming mahadashas:\n${vimshottari.mahadashas.slice(0, 6).map((period) => `${GRAHA_LABELS[period.lord]}: ${formatDate(period.start, chart.timezone)} – ${formatDate(period.end, chart.timezone)} (${period.years.toFixed(1)}y)`).join("\n")}`,
  ].join("\n\n");

  const yogaSection = [
    `Yogas:`,
    yogas.length
      ? yogas.slice(0, 8).map((yoga) => `${yoga.name} — ${yoga.summary}\n  ${yoga.evidence}`).join("\n\n")
      : `No major classical yoga combination is formed in this chart. This is common and not a negative: most charts are read through house lords and dashas rather than named yogas.`,
  ].join("\n\n");

  const career = [
    `Career & Purpose:`,
    `Your 10th house of career and public standing falls in ${RASHIS[(chart.ascendantRashiIndex + 9) % 12].name}. ${describeOccupants(occupantsOfHouse(chart, 10), "No planet sits directly in this house right now, so its themes are shaped more by its ruling sign than by a strong planetary presence.")} Its lord, ${GRAHA_LABELS[houseLords[9].lord]}, sits in your ${ordinal(houseLords[9].lordHouse)} house — which is where your professional energy actually gets spent.`,
  ].join("\n\n");

  const relationships = [
    `Relationships:`,
    `Your 7th house of partnership falls in ${RASHIS[(chart.ascendantRashiIndex + 6) % 12].name}. ${describeOccupants(occupantsOfHouse(chart, 7), "No planet sits directly in this house, so partnership themes lean on its ruling sign's natural temperament.")} Its lord, ${GRAHA_LABELS[houseLords[6].lord]}, occupies your ${ordinal(houseLords[6].lordHouse)} house. Venus, the natural signifier of relationships, sits in your ${ordinal(houseOf(chart, venus.rashiIndex))} house (${RASHIS[venus.rashiIndex].name})${dignityOf("venus")?.dignity !== "neutral" ? ` — ${dignityOf("venus")!.dignityLabel.toLowerCase()}` : ""}.`,
  ].join("\n\n");

  const health = [
    `Health & Wellbeing:`,
    `Your 6th house (daily routine, health) falls in ${RASHIS[(chart.ascendantRashiIndex + 5) % 12].name}: ${describeOccupants(occupantsOfHouse(chart, 6), "no planet occupies it directly.")} Your 8th house (resilience, transformation) falls in ${RASHIS[(chart.ascendantRashiIndex + 7) % 12].name}: ${describeOccupants(occupantsOfHouse(chart, 8), "no planet occupies it directly.")} As with all Jyotish health indicators, treat this as a symbolic lens, never medical guidance.`,
  ].join("\n\n");

  const wealth = [
    `Wealth & Guidance:`,
    `Your 2nd house (accumulated wealth, family) falls in ${RASHIS[(chart.ascendantRashiIndex + 1) % 12].name}: ${describeOccupants(occupantsOfHouse(chart, 2), "no planet occupies it directly.")} Your 11th house (gains, aspirations) falls in ${RASHIS[(chart.ascendantRashiIndex + 10) % 12].name}: ${describeOccupants(occupantsOfHouse(chart, 11), "no planet occupies it directly.")}`,
    `By Sarvashtakavarga, your strongest houses are the ${joinWithAnd(ashtakavarga.strongestHouses.map((house) => ordinal(house)))} (${ashtakavarga.strongestHouses.map((house) => ashtakavarga.sarvaByHouse[house - 1].bindus).join(", ")} bindus) and the most support-needing are the ${joinWithAnd(ashtakavarga.weakestHouses.map((house) => ordinal(house)))}. The average is 28 bindus per house.`,
  ].join("\n\n");

  const doshas = renderDoshaSection(detailed);

  const strengthSection = [
    `Planetary Strength:`,
    dignities.map((entry) => {
      const flags = [
        entry.dignityLabel,
        entry.combust ? `combust (${entry.combustSeparationDeg.toFixed(1)}° from Sun)` : null,
        entry.inPlanetaryWar ? (entry.wonPlanetaryWar ? "won a planetary war" : "lost a planetary war") : null,
        entry.avasthaLabel,
      ].filter(Boolean);
      return `${GRAHA_LABELS[entry.graha]}: ${flags.join(" · ")}`;
    }).join("\n"),
  ].join("\n\n");

  const houseLordSection = [
    `House Lords:`,
    houseLords.map((entry) => `House ${entry.house} (${entry.rashiName}) — ${entry.signification}. Lord ${GRAHA_LABELS[entry.lord]} in house ${entry.lordHouse}${entry.occupants.length ? `. Occupied by ${entry.occupants.map((graha) => GRAHA_LABELS[graha]).join(", ")}` : ""}`).join("\n"),
  ].join("\n\n");

  const navamsa = detailed.vargas.find((varga) => varga.varga === "D9");
  const vargaSection = navamsa
    ? [
        `Navamsa (D9):`,
        `Your Navamsa ascendant is ${RASHIS[navamsa.ascendantRashiIndex].name}. The D9 is the second chart every Jyotish reader opens — it shows marriage, dharma, and the strength a planet really carries beneath its birth-chart placement.`,
        navamsa.placements.map((placement) => `${GRAHA_LABELS[placement.graha]}: ${RASHIS[placement.rashiIndex].name}`).join("\n"),
      ].join("\n\n")
    : "";

  const aspectSection = [
    `Aspects (Drishti):`,
    detailed.aspects.filter((aspect) => aspect.aspectedGrahas.length).slice(0, 12).map(describeAspect).join("\n") || `No planet-to-planet aspects fall in this chart.`,
  ].join("\n\n");

  const positionsSection = [
    `Planetary Positions:`,
    chart.positions.map((position) => placementLine(position, dignityOf(position.graha), chart.ascendantRashiIndex)).join("\n"),
  ].join("\n\n");

  const closing = `This reading is calculated from your exact birth moment using a real astronomical ephemeris and the Lahiri ayanamsa — not generated text. It is traditional Parashari guidance, not a scientific or guaranteed prediction; for major life decisions, always cross-check with a qualified practitioner.`;

  return [
    birthDetails, panchangSection, overview, dashaSection, yogaSection,
    career, relationships, health, wealth, doshas,
    strengthSection, houseLordSection, vargaSection, aspectSection, positionsSection, closing,
  ].filter(Boolean).join("\n\n");
}

function renderDoshaSection(detailed: DetailedKundli): string {
  const { mangal, kaalSarp, sadeSati } = detailed.doshas;

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

  const warLine = detailed.planetaryWars.length
    ? `Graha Yuddha (planetary war): ${detailed.planetaryWars.map((war) => `${GRAHA_LABELS[war.winner]} and ${GRAHA_LABELS[war.loser]} are within ${war.separationDeg.toFixed(2)}° — ${GRAHA_LABELS[war.winner]} prevails`).join("; ")}.`
    : null;

  return [
    `Doshas:`,
    [mangalLine, kaalSarpLine, sadeSatiLine, warLine].filter(Boolean).join("\n\n"),
    `This is traditional Parashari guidance calculated from your actual chart, not a scientific or guaranteed prediction — for major life decisions, always cross-check with a qualified practitioner.`,
  ].join("\n\n");
}

export { VARGA_META, type VargaChart, type VargaKey };
export type { Aspect, GrahaDignityDetail, Yoga, BirthPanchang, VimshottariResult, ActiveDasha, AshtakavargaResult, PlanetaryWar };
