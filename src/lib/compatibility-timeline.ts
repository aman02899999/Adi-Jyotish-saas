import "server-only";

import { computeGrahaPositions } from "@/lib/astro-engine";

/** No Vimshottari Dasha engine exists in this codebase, so a couple's "favorable timing" can't be
 * dasha-based. This uses real TRANSIT timing instead: for each of the next 12 months, Jupiter and
 * Venus are checked against both partners' natal Moon signs (favorable outside the three classical
 * dusthana houses — 6th/8th/12th), and Saturn is checked for the Sade Sati houses (12th/1st/2nd) plus
 * the 7th/8th, which classical Jyotish treats as testing for partnerships. Same "here's when the
 * stars favor you as a couple" value as a dasha timeline, built on the ephemeris engine that actually
 * exists rather than one that would need to be invented from scratch. */

const DUSTHANA_HOUSES = new Set([6, 8, 12]);
const SADE_SATI_HOUSES = new Set([12, 1, 2]);

export type TimelineMonth = {
  monthLabel: string;
  score: number;
  tier: "favorable" | "supportive" | "neutral" | "caution";
  headline: string;
};

function relativeHouse(fromRashiIndex: number, toRashiIndex: number) {
  return ((toRashiIndex - fromRashiIndex + 12) % 12) + 1;
}

function tierFromScore(score: number): TimelineMonth["tier"] {
  if (score >= 3) return "favorable";
  if (score >= 1) return "supportive";
  if (score === 0) return "neutral";
  return "caution";
}

export function computeCompatibilityTimeline({ nameA, moonARashiIndex, nameB, moonBRashiIndex, monthsAhead = 12 }: {
  nameA: string;
  moonARashiIndex: number;
  nameB: string;
  moonBRashiIndex: number;
  monthsAhead?: number;
}): TimelineMonth[] {
  const now = new Date();
  const months: TimelineMonth[] = [];

  for (let i = 0; i < monthsAhead; i++) {
    // Day 15 sidesteps month-length overflow (e.g. Jan 31 + 1 month rolling into March).
    const snapshotDate = new Date(now.getFullYear(), now.getMonth() + i, 15);
    const positions = computeGrahaPositions(snapshotDate);
    const jupiter = positions.find((p) => p.graha === "jupiter")!;
    const venus = positions.find((p) => p.graha === "venus")!;
    const saturn = positions.find((p) => p.graha === "saturn")!;

    const jupiterAFavorable = !DUSTHANA_HOUSES.has(relativeHouse(moonARashiIndex, jupiter.rashiIndex));
    const jupiterBFavorable = !DUSTHANA_HOUSES.has(relativeHouse(moonBRashiIndex, jupiter.rashiIndex));
    const venusAFavorable = !DUSTHANA_HOUSES.has(relativeHouse(moonARashiIndex, venus.rashiIndex));
    const venusBFavorable = !DUSTHANA_HOUSES.has(relativeHouse(moonBRashiIndex, venus.rashiIndex));
    const saturnAHouse = relativeHouse(moonARashiIndex, saturn.rashiIndex);
    const saturnBHouse = relativeHouse(moonBRashiIndex, saturn.rashiIndex);
    const saturnATesting = SADE_SATI_HOUSES.has(saturnAHouse) || saturnAHouse === 7 || saturnAHouse === 8;
    const saturnBTesting = SADE_SATI_HOUSES.has(saturnBHouse) || saturnBHouse === 7 || saturnBHouse === 8;

    let score = 0;
    if (jupiterAFavorable) score += 1;
    if (jupiterBFavorable) score += 1;
    if (venusAFavorable) score += 1;
    if (venusBFavorable) score += 1;
    if (saturnATesting) score -= 1;
    if (saturnBTesting) score -= 1;

    const factors: string[] = [];
    if (jupiterAFavorable && jupiterBFavorable) factors.push("Jupiter supports growth for both of you");
    else if (jupiterAFavorable) factors.push(`Jupiter favors ${nameA}`);
    else if (jupiterBFavorable) factors.push(`Jupiter favors ${nameB}`);

    if (venusAFavorable && venusBFavorable) factors.push("Venus favors warmth and romance for both of you");
    else if (venusAFavorable) factors.push(`Venus favors ${nameA}`);
    else if (venusBFavorable) factors.push(`Venus favors ${nameB}`);

    if (saturnATesting && saturnBTesting) factors.push("Saturn is testing patience for both of you");
    else if (saturnATesting) factors.push(`Saturn is testing patience for ${nameA}`);
    else if (saturnBTesting) factors.push(`Saturn is testing patience for ${nameB}`);

    const headline = factors.length ? `${factors.join("; ")}.` : "A quiet, unremarkable month astrologically for this pairing.";

    months.push({
      monthLabel: snapshotDate.toLocaleDateString("en", { month: "long", year: "numeric" }),
      score,
      tier: tierFromScore(score),
      headline,
    });
  }

  return months;
}
