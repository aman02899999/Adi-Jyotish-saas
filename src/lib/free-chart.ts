import "server-only";

import { NAKSHATRAS, RASHIS, GRAHA_LABELS } from "@/lib/astro-engine";
import { buildKundliChart, type KundliChart } from "@/lib/kundli-engine";
import { computeVimshottari } from "@/lib/vedic/vimshottari";

/**
 * The homepage's instant, free taste of a real chart: the four facts a visitor recognises as
 * "theirs" (Lagna, Moon sign and nakshatra, Sun sign, current Mahadasha), computed by the same
 * engine as the paid Kundli report. Pure CPU, nothing stored and no AI call, so it costs nothing
 * however many visitors try it. The full house-by-house reading stays behind the paid report.
 *
 * Without a birth time only what holds for the whole day is stated. The Moon moves up to about 15°
 * a day, more than a nakshatra, so a chart cast for noon could name the wrong nakshatra and shift
 * the dasha dates by years. Each fact is checked at the start and end of the birth date (and noon,
 * for the nakshatra) and every value it could take is returned. The Lagna, which changes every two
 * hours, and the dasha end date are left out.
 */

type Sign = { name: string; english: string };

export type FreeChartPreview = {
  matchedPlace: string;
  timeKnown: boolean;
  ascendant: { name: string; english: string; degree: number } | null;
  /** One entry when certain; two or three when the day's unknown time allows more than one. */
  moon: { signs: Sign[]; nakshatras: string[]; pada: number | null };
  sun: { signs: Sign[] };
  /** endsOn is null without a birth time; the whole field is null when the lord itself is uncertain. */
  mahadasha: { lord: string; endsOn: string | null } | null;
};

const sign = (index: number): Sign => ({ name: RASHIS[index].name, english: RASHIS[index].english });
const unique = <T>(values: T[], key: (value: T) => string) => values.filter((value, index) => values.findIndex((other) => key(other) === key(value)) === index);

function grahas(chart: KundliChart) {
  const moon = chart.positions.find((position) => position.graha === "moon");
  const sun = chart.positions.find((position) => position.graha === "sun");
  if (!moon || !sun) throw new Error("The chart engine returned no Moon or Sun position.");
  return { moon, sun };
}

function runningMahadasha(chart: KundliChart, asOf: Date) {
  const { mahadashas } = computeVimshottari(grahas(chart).moon.longitude, chart.birthInstant, { depth: 1, cycles: 2 });
  return mahadashas.find((period) => period.start <= asOf && asOf < period.end) ?? null;
}

export function buildFreeChartPreview(input: { birthDate: string; birthTime: string | null; birthPlace: string }, asOf = new Date()): FreeChartPreview {
  if (input.birthTime) {
    const chart = buildKundliChart({ name: "", ...input, birthTime: input.birthTime });
    const { moon, sun } = grahas(chart);
    const current = runningMahadasha(chart, asOf);
    return {
      matchedPlace: chart.matchedPlace,
      timeKnown: true,
      ascendant: { ...sign(chart.ascendantRashiIndex), degree: Math.floor(chart.ascendantDegree) },
      moon: { signs: [sign(moon.rashiIndex)], nakshatras: [NAKSHATRAS[moon.nakshatraIndex]], pada: moon.pada },
      sun: { signs: [sign(sun.rashiIndex)] },
      mahadasha: current ? { lord: GRAHA_LABELS[current.lord], endsOn: current.end.toISOString().slice(0, 10) } : null,
    };
  }

  // The Moon and Sun only move forward, so the first and last minute of the day bound every value
  // in between. Half a day of Moon motion is under one nakshatra, so adding noon catches any
  // nakshatra the Moon passes all the way through.
  const charts = ["00:00", "12:00", "23:59"].map((birthTime) => buildKundliChart({ name: "", ...input, birthTime }));
  const [first, , last] = charts;
  const ends = [first, last];
  const lords = unique(ends.map((chart) => runningMahadasha(chart, asOf)?.lord ?? null), String);
  return {
    matchedPlace: first.matchedPlace,
    timeKnown: false,
    ascendant: null,
    moon: {
      signs: unique(ends.map((chart) => sign(grahas(chart).moon.rashiIndex)), (value) => value.name),
      nakshatras: unique(charts.map((chart) => NAKSHATRAS[grahas(chart).moon.nakshatraIndex]), String),
      pada: null,
    },
    sun: { signs: unique(ends.map((chart) => sign(grahas(chart).sun.rashiIndex)), (value) => value.name) },
    mahadasha: lords.length === 1 && lords[0] ? { lord: GRAHA_LABELS[lords[0]], endsOn: null } : null,
  };
}
