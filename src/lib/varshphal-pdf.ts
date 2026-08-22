import "server-only";

import { GRAHA_LABELS, formatDegree, NAKSHATRAS, RASHIS, type GrahaKey } from "@/lib/astro-engine";
import { renderVarshphalReport, type VarshphalChart } from "@/lib/varshphal";
import {
  attributionLine, BASE_GLOSSARY, COPPER, GRAHA_SIGNIFICANCE, HOUSE_SIGNIFICATIONS, HOUSE_TITLES,
  MUTED, type PdfAttribution, RASHI_TRAITS, ReportWriter,
} from "@/lib/report-writer";

/**
 * The Varshphal (annual solar-return) counterpart to kundli-pdf.ts, built on the same shared
 * layout engine (report-writer.ts) so both premium reports share an identical look — cover,
 * table of contents, sections that each force a fresh page, zebra tables. Every number here comes
 * from buildVarshphalChart()'s real solar-return search (astro-engine.ts); the narrative text is
 * parsed from the exact same renderVarshphalReport() shown on the website, so this PDF can never
 * drift from what the member already sees on screen.
 */

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

const VARSHPHAL_GLOSSARY: Array<[string, string]> = [
  ["Varshphal", "The classical annual chart — cast for the exact moment the transiting Sun returns to its natal sidereal longitude, one year at a time."],
  ["Solar Return", "The precise instant, each year, when the Sun's real position matches your natal Sun exactly — the moment this year's chart is cast from."],
  ["Varshesh", "This year's 'ruling planet' — the classical lord of the sign rising (Lagna) in the Varshphal chart, used as a quick read on the year's overall theme."],
  ...BASE_GLOSSARY,
];

const NARRATIVE_HEADINGS = ["Overview", "Career & Public Life", "Relationships", "Wealth & Growth"];

function parseNarrativeSections(reportText: string): Array<{ heading: string; body: string }> {
  const lines = reportText.split("\n").map((line) => line.trim());
  const sections: Array<{ heading: string; body: string[] }> = [];
  let current: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    const heading = NARRATIVE_HEADINGS.find((candidate) => line === `${candidate}:`);
    if (heading) {
      current = { heading, body: [] };
      sections.push(current);
      continue;
    }
    if (current && line) current.body.push(line);
  }

  return sections.map((section) => ({ heading: section.heading, body: section.body.join(" ") }));
}

export type VarshphalPdfOptions = {
  reportId: string;
  generatedAt: Date;
  studioName: string;
  supportEmail: string;
  attribution: PdfAttribution;
};

export async function generateVarshphalPdf(chart: VarshphalChart, name: string, options: VarshphalPdfOptions): Promise<Uint8Array> {
  const runningTitle = `${options.studioName} — ${chart.year} Varshphal for ${name}`;
  const writer = await ReportWriter.create(runningTitle, options.reportId);
  const attribution = attributionLine(options.attribution, options.studioName, "automated Varshphal engine");
  const returnDateLabel = chart.returnMoment.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  writer.coverPage({
    studioName: options.studioName,
    reportKind: `${chart.year} VARSHPHAL — ANNUAL REPORT`,
    subjectName: name,
    detailRows: [
      ["Solar Return Date", returnDateLabel],
      ["Cast For", chart.matchedPlace],
      ["Lagna (Ascendant)", `${RASHIS[chart.ascendantRashiIndex].name} — ${formatDegree(chart.ascendantDegree)}`],
    ],
    attributionLine: attribution,
    reportId: options.reportId,
    generatedAt: options.generatedAt,
  });
  writer.reserveTocPage();

  // 1. About This Report
  writer.beginSection("About This Report");
  writer.paragraph(
    `This is your Varshphal — the classical Vedic "annual return" chart. Rather than looking at your birth moment, it's cast for the exact instant, this year, when the transiting Sun returns to precisely the same sidereal position it held when you were born. That instant, ${returnDateLabel}, opens your ${chart.year} chart.`,
  );
  writer.paragraph(
    `The same deterministic methodology as your birth chart applies: real astronomical positions, sidereal zodiac, Lahiri (Chitrapaksha) ayanamsa, Whole Sign houses. Nothing here is AI-generated — the solar return moment itself is found by a real numerical search against the actual position of the Sun.`,
  );
  writer.paragraph(
    `A Varshphal describes the year's general tone and themes, not certain events on certain dates. It's traditional/cultural guidance, not a scientific or guaranteed prediction — for major decisions, use your own judgment alongside professional guidance where relevant.`,
    { oblique: true, color: MUTED },
  );

  // 2. Year Overview
  writer.beginSection("This Year's Overview");
  writer.panel([
    ["Client", name],
    ["Year", String(chart.year)],
    ["Solar Return Date", returnDateLabel],
    ["Cast For", chart.matchedPlace],
    ["Ayanamsa", "Lahiri (Chitrapaksha)"],
    ["House System", "Whole Sign"],
  ]);
  writer.paragraph(attribution, { size: 9.5, bold: true, color: COPPER });

  const moon = chart.positions.find((p) => p.graha === "moon")!;
  const varshesh = RASHI_LORDS[chart.ascendantRashiIndex];

  writer.subheading("This Year's Lagna & Moon");
  writer.paragraph(
    `Your Varshphal Lagna — the sign rising at the exact solar-return moment — sets this year's overall lens, the same way your birth Lagna does for your life as a whole. Your Varshphal Moon shows this year's dominant emotional undertone.`,
  );
  writer.panel([
    ["Lagna (Ascendant)", `${RASHIS[chart.ascendantRashiIndex].name} — ${formatDegree(chart.ascendantDegree)}`],
    ["Moon Sign (Rashi)", RASHIS[moon.rashiIndex].name],
    ["Moon Nakshatra", `${NAKSHATRAS[moon.nakshatraIndex]}, Pada ${moon.pada}`],
  ]);

  writer.subheading(`The Varshesh — ${GRAHA_LABELS[varshesh]}`);
  writer.paragraph(
    `The Varshesh is this year's "ruling planet" — the classical lord of your Varshphal Lagna's sign, used as a quick read on the year's overall theme. This year's Varshesh is ${GRAHA_LABELS[varshesh]}, which classically governs ${GRAHA_SIGNIFICANCE[varshesh]}.`,
  );
  writer.paragraph(VARSHESH_THEMES[varshesh] ? `In broad terms, this points toward ${VARSHESH_THEMES[varshesh]}` : `This planet's placement this year is worth weighing alongside the rest of the chart.`, { bold: true });

  writer.subheading(`About ${RASHIS[chart.ascendantRashiIndex].name} Rising, For This Year`);
  writer.paragraph(`With ${RASHIS[chart.ascendantRashiIndex].name} rising this year, the year's overall temperament leans ${RASHI_TRAITS[chart.ascendantRashiIndex].toLowerCase()}`);

  // 3. Planetary Positions
  writer.beginSection("This Year's Planetary Positions");
  writer.paragraph(
    `Every graha's exact placement at the solar-return moment — its rashi, degree, nakshatra, and this year's house from your Varshphal Lagna.`,
  );
  writer.table(
    ["Graha", "Rashi", "Degree", "Nakshatra", "Pada", "Motion"],
    [90, 85, 60, 130, 40, 0],
    chart.positions.map((position) => [
      GRAHA_LABELS[position.graha],
      RASHIS[position.rashiIndex].name,
      formatDegree(position.longitude),
      NAKSHATRAS[position.nakshatraIndex],
      String(position.pada),
      position.isRetrograde ? "Retrograde" : "Direct",
    ]),
  );

  for (const position of chart.positions) {
    writer.subheading(`${GRAHA_LABELS[position.graha]}${position.isRetrograde ? " (Retrograde)" : ""} — This Year`);
    writer.paragraph(
      `${GRAHA_LABELS[position.graha]} classically governs ${GRAHA_SIGNIFICANCE[position.graha]}. This year, it sits in ${RASHIS[position.rashiIndex].name} (${formatDegree(position.longitude)}), in the ${NAKSHATRAS[position.nakshatraIndex]} nakshatra, pada ${position.pada}${position.isRetrograde ? ", moving retrograde" : ""}. Placed here, this area of life tends to carry a tone that's ${RASHI_TRAITS[position.rashiIndex].toLowerCase()}`,
    );
  }

  // 4. Bhava Chart
  writer.beginSection("This Year's Bhava Chart");
  writer.paragraph(
    `The 12 houses, counted from this year's Lagna, each govern a different area of life for the year ahead. This is not your natal chart's houses — it's a fresh count from your Varshphal Lagna.`,
  );
  const houseCount = 12;
  const houses = Array.from({ length: houseCount }, (_, index) => {
    const house = index + 1;
    const rashiIndex = (chart.ascendantRashiIndex + index) % 12;
    const occupants = chart.positions.filter((position) => position.rashiIndex === rashiIndex);
    return { house, rashiIndex, occupants };
  });
  writer.table(
    ["House", "Sign", "Occupants This Year"],
    [50, 90, 0],
    houses.map((house) => [
      String(house.house),
      RASHIS[house.rashiIndex].name,
      house.occupants.length ? house.occupants.map((occupant) => `${GRAHA_LABELS[occupant.graha]}${occupant.isRetrograde ? " (R)" : ""}`).join(", ") : "—",
    ]),
  );

  for (const house of houses) {
    writer.subheading(`House ${house.house} — ${HOUSE_TITLES[house.house - 1]}`);
    const occupantLine = house.occupants.length
      ? `${house.occupants.map((occupant) => GRAHA_LABELS[occupant.graha]).join(" and ")} ${house.occupants.length > 1 ? "sit" : "sits"} here this year, bringing extra weight to this house's themes.`
      : `No graha occupies this house directly this year, so its themes are shaped more by its ruling sign than a strong planetary presence.`;
    writer.paragraph(
      `This house governs ${HOUSE_SIGNIFICATIONS[house.house - 1].toLowerCase()} This year it falls in ${RASHIS[house.rashiIndex].name}. ${occupantLine}`,
    );
  }

  // 5. Life Themes
  writer.beginSection(`Themes for ${chart.year}`);
  const narrative = parseNarrativeSections(renderVarshphalReport(chart, name));
  for (const section of narrative) {
    writer.subheading(section.heading);
    writer.paragraph(section.body);
  }

  // 6. Glossary
  writer.beginSection("Glossary of Terms");
  writer.paragraph("A quick reference for the classical terms used throughout this report.");
  for (const [term, definition] of VARSHPHAL_GLOSSARY) {
    writer.subheading(term);
    writer.paragraph(definition);
  }

  // 7. Closing
  writer.beginSection(`About ${options.studioName}`);
  writer.paragraph(
    `${options.studioName} brings together real astronomical calculation (not AI guesswork) with classical Jyotish methodology to produce charts, matching reports, and consultations you can actually trust the numbers behind. Every Kundli, Varshphal, and matching report on the platform is computed the same way this one was — deterministically, from your real birth data.`,
  );
  writer.subheading("Methodology & Versioning");
  writer.paragraph(
    `Ayanamsa: Lahiri (Chitrapaksha). Zodiac: Sidereal (Vedic). House System: Whole Sign. Solar return found by real numerical search against the Sun's actual position, not a tabulated estimate. Report ID ${options.reportId}, generated ${options.generatedAt.toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })}.`,
  );
  writer.subheading("Disclaimer");
  writer.paragraph(
    `This report is calculated using the selected astrological methodology — it is traditional/cultural guidance, not a scientific or guaranteed prediction. For health, legal, financial, or other high-stakes decisions, please consult a qualified professional in that field.`,
    { oblique: true, color: MUTED },
  );
  writer.subheading("Questions?");
  writer.paragraph(`Contact ${options.supportEmail}. Generated securely by ${options.studioName}.`);

  writer.finalizeToc();

  return writer.save();
}
