import "server-only";

import { GRAHA_LABELS, NAKSHATRAS, RASHIS, formatDegree } from "@/lib/astro-engine";
import { detectDoshas } from "@/lib/dosha-engine";
import { buildHouseGrid, renderKundliReport, type KundliChart } from "@/lib/kundli-engine";
import {
  attributionLine, BASE_GLOSSARY, COPPER, GRAHA_SIGNIFICANCE, HOUSE_SIGNIFICATIONS, HOUSE_TITLES,
  MUTED, type PdfAttribution, RASHI_TRAITS, ReportWriter,
} from "@/lib/report-writer";

/**
 * A premium, full-length Kundli report document — the kind a practitioner would actually hand a
 * client, not a one-line invoice. Every number comes from the deterministic engine
 * (astro-engine.ts + dosha-engine.ts); every piece of reference text below (planet/house/rashi
 * significations) is standard, widely-published classical Jyotish material, not fabricated for
 * any specific chart — it's the same kind of glossary content a real astrology textbook or
 * practitioner's own notes would include. The narrative sections are parsed from the exact same
 * renderKundliReport() text shown on the website, so the PDF can never drift from what the member
 * already sees on screen.
 *
 * Structural guarantee, not a length target hit by padding: every major section forces its own
 * new page (see ReportWriter.beginSection), so the page count is a natural consequence of real
 * content (cover, contents, methodology, chart overview, 9 planet write-ups, 12 house write-ups,
 * doshas, life themes, glossary, closing) rather than something tuned to hit a number.
 *
 * The shared cover/TOC/section/table layout engine lives in report-writer.ts — see
 * varshphal-pdf.ts for the other report built on the same engine.
 */

export type KundliPdfAttribution = PdfAttribution;

export type KundliPdfOptions = {
  reportId: string;
  generatedAt: Date;
  studioName: string;
  supportEmail: string;
  attribution: PdfAttribution;
};

const KUNDLI_GLOSSARY: Array<[string, string]> = [
  ...BASE_GLOSSARY,
  ["Dosha", "A specific planetary combination classical Jyotish flags as worth extra attention — not a curse, and often has classical cancellation conditions."],
];

// Same section markers renderKundliReport() actually emits — kept in sync with kundli-engine.ts
// so this PDF's narrative text is always identical to what the website shows.
const NARRATIVE_HEADINGS = [
  "Birth Details", "Birth Panchang", "Overview", "Dasha (Planetary Periods)", "Yogas",
  "Career & Purpose", "Relationships", "Health & Wellbeing", "Wealth & Guidance", "Doshas",
  "Planetary Strength", "House Lords", "Navamsa (D9)", "Aspects (Drishti)",
];

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

export async function generateKundliPdf(chart: KundliChart, options: KundliPdfOptions): Promise<Uint8Array> {
  const runningTitle = `${options.studioName} — Kundli Report for ${chart.name}`;
  const writer = await ReportWriter.create(runningTitle, options.reportId);
  const attribution = attributionLine(options.attribution, options.studioName, "automated Kundli engine");

  writer.coverPage({
    studioName: options.studioName,
    reportKind: "VEDIC KUNDLI REPORT",
    subjectName: chart.name,
    detailRows: [
      ["Date of Birth", chart.birthDate],
      ["Time of Birth", chart.birthTime],
      ["Place of Birth", chart.matchedPlace],
    ],
    attributionLine: attribution,
    reportId: options.reportId,
    generatedAt: options.generatedAt,
  });
  writer.reserveTocPage();

  // 1. About This Report
  writer.beginSection("About This Report");
  writer.paragraph(
    `This is a full Vedic (sidereal) Kundli — a birth chart calculated from the exact date, time, and place you provided, mapping where the Sun, Moon, and every other classical graha stood at the moment of your birth. Everything in this report is calculated, not guessed: real astronomical positions, converted to the sidereal zodiac using the Lahiri (Chitrapaksha) ayanamsa, the most widely used standard in Vedic astrology.`,
  );
  writer.paragraph(
    `Houses (bhavas) are assigned using the classical Whole Sign system: your Lagna's own rashi is the 1st house in full, and each following rashi in zodiacal order is the next house — the traditional Parashari default, not a modern approximation.`,
  );
  writer.paragraph(
    `Jyotish is a traditional system of symbolic guidance passed down over centuries — it offers a lens for reflection, not a scientific guarantee. Nothing in this report should be treated as medical, legal, or financial advice, or as a certain prediction of events. For major decisions, always use your own judgment alongside professional guidance where relevant.`,
    { oblique: true, color: MUTED },
  );

  // 2. Birth Chart Overview
  writer.beginSection("Birth Chart Overview");
  writer.panel([
    ["Client", chart.name],
    ["Date of Birth", chart.birthDate],
    ["Time of Birth", chart.birthTime],
    ["Place of Birth", chart.matchedPlace],
    ["Ayanamsa", "Lahiri (Chitrapaksha)"],
    ["House System", "Whole Sign"],
  ]);
  writer.paragraph(attribution, { size: 9.5, bold: true, color: COPPER });

  const moon = chart.positions.find((p) => p.graha === "moon")!;
  const sun = chart.positions.find((p) => p.graha === "sun")!;

  writer.subheading("Your Lagna, Moon & Sun — The Foundation");
  writer.paragraph(
    `Classical Jyotish reads three placements first, because together they form the lens everything else is seen through: your Lagna (Ascendant) — how you meet the world; your Moon — your instinctive, emotional nature; and your Sun — the core purpose you're steadily growing toward.`,
  );
  writer.panel([
    ["Lagna (Ascendant)", `${RASHIS[chart.ascendantRashiIndex].name} — ${formatDegree(chart.ascendantDegree)}`],
    ["Moon Sign (Rashi)", RASHIS[moon.rashiIndex].name],
    ["Moon Nakshatra", `${NAKSHATRAS[moon.nakshatraIndex]}, Pada ${moon.pada}`],
    ["Sun Sign (Rashi)", RASHIS[sun.rashiIndex].name],
  ]);
  writer.subheading(`About Your Lagna — ${RASHIS[chart.ascendantRashiIndex].name} Rising`);
  writer.paragraph(`${RASHIS[chart.ascendantRashiIndex].name} rising individuals are typically ${RASHI_TRAITS[chart.ascendantRashiIndex].toLowerCase()}`);
  writer.subheading(`About Your Moon Sign — ${RASHIS[moon.rashiIndex].name}`);
  writer.paragraph(`With the Moon in ${RASHIS[moon.rashiIndex].name}, your instinctive and emotional nature tends to be ${RASHI_TRAITS[moon.rashiIndex].toLowerCase()}`);

  // 3. Planetary Positions
  writer.beginSection("Planetary Positions (Graha Sphuta)");
  writer.paragraph(
    `Every graha's exact placement — its rashi, degree, nakshatra, and pada — computed for the precise moment and location of your birth. Retrograde motion (apparent backward movement through the zodiac, as seen from Earth) is interpretively significant in Jyotish and is noted where it applies.`,
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
    writer.subheading(`${GRAHA_LABELS[position.graha]}${position.isRetrograde ? " (Retrograde)" : ""}`);
    writer.paragraph(
      `${GRAHA_LABELS[position.graha]} classically governs ${GRAHA_SIGNIFICANCE[position.graha]}. In your chart, it sits in ${RASHIS[position.rashiIndex].name} (${formatDegree(position.longitude)}), in the ${NAKSHATRAS[position.nakshatraIndex]} nakshatra, pada ${position.pada}${position.isRetrograde ? ", moving retrograde" : ""}. Placed in ${RASHIS[position.rashiIndex].name}, this area of life tends to express itself in a way that's ${RASHI_TRAITS[position.rashiIndex].toLowerCase()}`,
    );
  }

  // 4. Bhava Chart
  writer.beginSection("Bhava Chart (Houses from Lagna)");
  writer.paragraph(
    `The 12 houses (bhavas), counted from your Lagna, each govern a different area of life. Which rashi rules a house, and which grahas occupy it, both shape how that area of life tends to unfold for you.`,
  );
  const houses = buildHouseGrid(chart);
  writer.table(
    ["House", "Sign", "Occupants"],
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
      ? `${house.occupants.map((occupant) => GRAHA_LABELS[occupant.graha]).join(" and ")} ${house.occupants.length > 1 ? "sit" : "sits"} here, bringing extra weight to this house's themes.`
      : `No graha occupies this house directly, so its themes are shaped more by its ruling sign than a strong planetary presence.`;
    writer.paragraph(
      `This house governs ${HOUSE_SIGNIFICATIONS[house.house - 1].toLowerCase()} It falls in ${RASHIS[house.rashiIndex].name}. ${occupantLine}`,
    );
  }

  // 5. Doshas
  writer.beginSection("Doshas");
  writer.paragraph(
    `A dosha is a specific planetary combination classical Jyotish flags as worth extra attention — not a curse or a certainty, and several classical doshas have well-known cancellation conditions. The three checked below are calculated directly from your real chart data, not estimated.`,
  );

  const doshas = detectDoshas(chart);
  writer.subheading("Mangal Dosha (Manglik)");
  writer.paragraph(
    `Classically, Mangal Dosha is flagged when Mars occupies the 1st, 2nd, 4th, 7th, 8th, or 12th house from the Lagna or the Moon — traditionally weighed most heavily in marriage matching, where it's usually checked on both partners' charts.`,
  );
  writer.paragraph(
    doshas.mangal.present
      ? doshas.mangal.cancelled
        ? `In your chart: present but classically cancelled — Mars is in house ${doshas.mangal.houseFromLagna} from Lagna, and ${doshas.mangal.cancellationReason}`
        : `In your chart: present — Mars is in house ${doshas.mangal.houseFromLagna} from Lagna. Only the own-sign/exaltation cancellation is checked here; other classical cancellation conditions exist, so treat this as a starting point, not a final word.`
      : `In your chart: not present — Mars does not occupy a Mangal Dosha house from either your Lagna or your Moon.`,
    { bold: true },
  );

  writer.subheading("Kaal Sarp Dosha");
  writer.paragraph(
    `This is flagged when all seven classical grahas (Sun through Saturn) fall on one side of the Rahu-Ketu axis — described as the other planets being "hemmed in" between the two lunar nodes. Its traditional name varies by which house Rahu occupies.`,
  );
  writer.paragraph(
    doshas.kaalSarp.present
      ? `In your chart: present (${doshas.kaalSarp.name}) — all seven classical planets fall on one side of the Rahu-Ketu axis.`
      : `In your chart: not present — the seven classical planets are not fully hemmed between Rahu and Ketu.`,
    { bold: true },
  );

  writer.subheading("Sade Sati");
  writer.paragraph(
    `Sade Sati refers to the roughly seven-and-a-half-year period when transiting Saturn moves through the 12th, 1st, and 2nd houses counted from your natal Moon — traditionally seen as a period calling for discipline and steady effort rather than shortcuts.`,
  );
  writer.paragraph(
    doshas.sadeSati.active
      ? `Currently: active, ${doshas.sadeSati.phase} phase — transiting Saturn is in ${doshas.sadeSati.currentSaturnRashi}, relative to your natal Moon in ${doshas.sadeSati.natalMoonRashi}.`
      : `Currently: not active — transiting Saturn (${doshas.sadeSati.currentSaturnRashi}) is not in the 12th, 1st, or 2nd house from your natal Moon (${doshas.sadeSati.natalMoonRashi}).`,
    { bold: true },
  );

  // 6. Life Themes
  writer.beginSection("Life Themes");
  const narrative = parseNarrativeSections(renderKundliReport(chart));
  for (const section of narrative) {
    if (section.heading === "Doshas") continue; // already covered in full above
    writer.subheading(section.heading);
    writer.paragraph(section.body);
  }

  // 7. Glossary
  writer.beginSection("Glossary of Terms");
  writer.paragraph("A quick reference for the classical terms used throughout this report.");
  for (const [term, definition] of KUNDLI_GLOSSARY) {
    writer.subheading(term);
    writer.paragraph(definition);
  }

  // 8. Closing
  writer.beginSection(`About ${options.studioName}`);
  writer.paragraph(
    `${options.studioName} brings together real astronomical calculation (not AI guesswork) with classical Jyotish methodology to produce charts, matching reports, and consultations you can actually trust the numbers behind. Every Kundli, Varshphal, and matching report on the platform is computed the same way this one was — deterministically, from your real birth data.`,
  );
  writer.subheading("Methodology & Versioning");
  writer.paragraph(
    `Ayanamsa: Lahiri (Chitrapaksha). Zodiac: Sidereal (Vedic). House System: Whole Sign. Ephemeris: real astronomical planetary positions, not tabulated estimates. Report ID ${options.reportId}, generated ${options.generatedAt.toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })}.`,
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
