import "server-only";

import { NAKSHATRAS, RASHIS, GRAHA_LABELS } from "@/lib/astro-engine";
import { buildKundliChart } from "@/lib/kundli-engine";
import { computeVimshottari } from "@/lib/vedic/vimshottari";

/**
 * The homepage's instant, free taste of a real chart: the four facts a visitor recognises as
 * "theirs" (Lagna, Moon sign and nakshatra, Sun sign, current Mahadasha), computed by the same
 * engine as the paid Kundli report. Pure CPU, nothing stored and no AI call, so it costs nothing
 * however many visitors try it. The full house-by-house reading stays behind the paid report.
 */

export type FreeChartPreview = {
  matchedPlace: string;
  ascendant: { name: string; english: string; degree: number };
  moon: { name: string; english: string; nakshatra: string; pada: number };
  sun: { name: string; english: string };
  mahadasha: { lord: string; endsOn: string } | null;
};

export function buildFreeChartPreview(input: { birthDate: string; birthTime: string; birthPlace: string }, asOf = new Date()): FreeChartPreview {
  const chart = buildKundliChart({ name: "", ...input });
  const moon = chart.positions.find((position) => position.graha === "moon");
  const sun = chart.positions.find((position) => position.graha === "sun");
  if (!moon || !sun) throw new Error("The chart engine returned no Moon or Sun position.");

  const dashas = computeVimshottari(moon.longitude, chart.birthInstant, { depth: 1, cycles: 2 });
  const current = dashas.mahadashas.find((period) => period.start <= asOf && asOf < period.end) ?? null;

  const ascendant = RASHIS[chart.ascendantRashiIndex];
  const moonRashi = RASHIS[moon.rashiIndex];
  const sunRashi = RASHIS[sun.rashiIndex];
  return {
    matchedPlace: chart.matchedPlace,
    ascendant: { name: ascendant.name, english: ascendant.english, degree: Math.floor(chart.ascendantDegree) },
    moon: { name: moonRashi.name, english: moonRashi.english, nakshatra: NAKSHATRAS[moon.nakshatraIndex], pada: moon.pada },
    sun: { name: sunRashi.name, english: sunRashi.english },
    mahadasha: current ? { lord: GRAHA_LABELS[current.lord], endsOn: current.end.toISOString().slice(0, 10) } : null,
  };
}
