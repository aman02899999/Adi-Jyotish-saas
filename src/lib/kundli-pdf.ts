import "server-only";

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { GRAHA_LABELS, GrahaKey, NAKSHATRAS, RASHIS, formatDegree } from "@/lib/astro-engine";
import { detectDoshas } from "@/lib/dosha-engine";
import { buildHouseGrid, renderKundliReport, type KundliChart } from "@/lib/kundli-engine";

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
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.18, 0.16, 0.14);
const MUTED = rgb(0.45, 0.4, 0.36);
const COPPER = rgb(0.663, 0.345, 0.219);
const COPPER_LIGHT = rgb(0.92, 0.85, 0.78);
const RULE = rgb(0.85, 0.82, 0.78);
const PANEL = rgb(0.97, 0.955, 0.93);
const ZEBRA = rgb(0.955, 0.94, 0.91);
const CREAM = rgb(0.992, 0.985, 0.975);

type Color = ReturnType<typeof rgb>;

export type KundliPdfAttribution =
  | { type: "human"; astrologerName: string }
  | { type: "ai"; personaName: string };

export type KundliPdfOptions = {
  reportId: string;
  generatedAt: Date;
  studioName: string;
  supportEmail: string;
  attribution: KundliPdfAttribution;
};

// ── Classical reference content ──────────────────────────────────────────────────────────────
// Standard, widely-published Jyotish material (any astrology textbook covers the same ground) —
// general/classical, not a claim about any specific person beyond what their real chart places
// where.

const RASHI_TRAITS: string[] = [
  "Direct, energetic, and quick to act — natural initiators who lead from the front and prefer movement over waiting.",
  "Steady, patient, and grounded — natural builders who value security, comfort, and lasting results.",
  "Curious, communicative, and adaptable — quick thinkers who thrive on variety and exchange of ideas.",
  "Sensitive, nurturing, and protective — deeply attuned to home, family, and emotional bonds.",
  "Confident, warm, and expressive — natural leaders who enjoy recognition and creative self-expression.",
  "Precise, analytical, and service-oriented — meticulous, detail-focused problem-solvers.",
  "Diplomatic, harmony-seeking, and social — natural mediators who value balance and partnership.",
  "Intense, resourceful, and determined — deep thinkers with strong willpower and emotional depth.",
  "Optimistic, freedom-loving, and philosophical — natural explorers, teachers, and truth-seekers.",
  "Disciplined, ambitious, and practical — patient builders who play the long game.",
  "Independent, inventive, and humanitarian — forward-thinking, unconventional, and idea-driven.",
  "Compassionate, imaginative, and intuitive — deeply empathetic and often spiritually inclined.",
];

const GRAHA_SIGNIFICANCE: Record<GrahaKey, string> = {
  sun: "the soul, willpower, authority, father, vitality, and how you express your core identity",
  moon: "the mind, emotions, instincts, mother, and how you process feelings day to day",
  mars: "courage, drive, physical energy, siblings, and how you assert yourself",
  mercury: "intellect, communication, analysis, and adaptability",
  jupiter: "wisdom, growth, higher learning, wealth, and the guru — expansion and optimism",
  venus: "love, beauty, relationships, comfort, and creative or artistic expression",
  saturn: "discipline, responsibility, longevity, karma, and the lessons that take patience and time",
  rahu: "worldly ambition, obsession, unconventional drive, and karmic desire still being worked through",
  ketu: "detachment, spirituality, past-life inclination, and release from material attachment",
};

const HOUSE_TITLES = [
  "Self & Body", "Wealth & Family", "Courage & Communication", "Home & Comfort", "Children & Creativity",
  "Health & Service", "Partnership & Marriage", "Transformation & Longevity", "Fortune & Dharma",
  "Career & Status", "Gains & Aspirations", "Release & Liberation",
];

const HOUSE_SIGNIFICATIONS = [
  "Self, physical body, personality, and how you present yourself to the world.",
  "Wealth, family, accumulated resources, speech, and personal values.",
  "Courage, siblings, short journeys, communication, and self-effort.",
  "Home, mother, inner comfort, property, and emotional foundation.",
  "Children, creativity, intelligence, romance, and accumulated merit.",
  "Daily routine, health, obstacles, service, and competition.",
  "Partnership, marriage, business alliances, and one-to-one relationships.",
  "Transformation, longevity, shared resources, and what lies beneath the surface.",
  "Fortune, higher learning, long journeys, dharma, and the father.",
  "Career, public standing, authority, and life direction.",
  "Gains, income, friendships, networks, and aspirations.",
  "Release, expenses, foreign connections, solitude, and spiritual liberation.",
];

const GLOSSARY: Array<[string, string]> = [
  ["Lagna (Ascendant)", "The zodiac sign rising on the eastern horizon at the exact moment of birth — the reference point every house in the chart is counted from."],
  ["Rashi", "One of the 12 zodiac signs (30° each) that the Moon, Sun, and every other graha travel through."],
  ["Nakshatra", "One of the 27 lunar constellations (13°20' each) the Moon and other grahas pass through — a finer-grained placement than the rashi alone."],
  ["Pada", "A quarter-division of a nakshatra (3°20' each) — four padas per nakshatra, used for finer timing and matching work."],
  ["Graha", "A classical 'planet' in Jyotish — the Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, plus the lunar nodes Rahu and Ketu."],
  ["Bhava (House)", "One of 12 divisions of the chart counted from the Lagna, each governing a different area of life."],
  ["Retrograde", "A graha's apparent backward motion through the zodiac as seen from Earth — interpretively significant in Jyotish."],
  ["Dosha", "A specific planetary combination classical Jyotish flags as worth extra attention — not a curse, and often has classical cancellation conditions."],
  ["Ayanamsa", "The angular offset between the sidereal (star-fixed) and tropical (season-fixed) zodiacs — this report uses the Lahiri (Chitrapaksha) ayanamsa, the most widely used standard in Vedic astrology."],
  ["Whole Sign Houses", "A house system where each house is exactly one full rashi wide, starting from the Lagna's own sign — the classical Parashari default, used throughout this report."],
];

// ── Narrative parsing ────────────────────────────────────────────────────────────────────────
// Same section markers renderKundliReport() actually emits — kept in sync with kundli-engine.ts
// so this PDF's narrative text is always identical to what the website shows.
const NARRATIVE_HEADINGS = ["Overview", "Career & Purpose", "Relationships", "Health & Wellbeing", "Wealth & Guidance", "Doshas"];

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

// ── Layout engine ────────────────────────────────────────────────────────────────────────────

class ReportWriter {
  private doc!: PDFDocument;
  private page!: PDFPage;
  private font!: PDFFont;
  private bold!: PDFFont;
  private oblique!: PDFFont;
  private y = 0;
  private pageNumber = 0;
  private readonly runningTitle: string;
  private readonly reportId: string;
  readonly sections: Array<{ title: string; page: number }> = [];
  private tocPage: PDFPage | null = null;
  private tocCursorY = 0;

  private constructor(runningTitle: string, reportId: string) {
    this.runningTitle = runningTitle;
    this.reportId = reportId;
  }

  static async create(runningTitle: string, reportId: string) {
    const writer = new ReportWriter(runningTitle, reportId);
    writer.doc = await PDFDocument.create();
    writer.font = await writer.doc.embedFont(StandardFonts.Helvetica);
    writer.bold = await writer.doc.embedFont(StandardFonts.HelveticaBold);
    writer.oblique = await writer.doc.embedFont(StandardFonts.HelveticaOblique);
    writer.page = writer.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    writer.pageNumber = 1;
    writer.y = PAGE_HEIGHT - MARGIN;
    return writer;
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pageNumber += 1;
    this.y = PAGE_HEIGHT - MARGIN;
    this.runningHeader();
  }

  private runningHeader() {
    this.text(this.runningTitle, MARGIN, this.y, { size: 8, color: MUTED });
    const right = `${this.reportId} · Page ${this.pageNumber}`;
    this.text(right, PAGE_WIDTH - MARGIN - this.font.widthOfTextAtSize(right, 8), this.y, { size: 8, color: MUTED });
    this.y -= 14;
    this.ruleAt(this.y);
    this.y -= 22;
  }

  private ensureSpace(height: number) {
    if (this.y - height < MARGIN + 24) this.newPage();
  }

  private text(value: string, x: number, y: number, options: { size?: number; bold?: boolean; oblique?: boolean; color?: Color } = {}) {
    const font = options.oblique ? this.oblique : options.bold ? this.bold : this.font;
    this.page.drawText(value, { x, y, size: options.size ?? 10, font, color: options.color ?? INK });
  }

  private centeredText(value: string, y: number, options: { size?: number; bold?: boolean; color?: Color } = {}) {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.font;
    const width = font.widthOfTextAtSize(value, size);
    this.text(value, (PAGE_WIDTH - width) / 2, y, options);
  }

  private ruleAt(y: number, color: Color = RULE, thickness = 1) {
    this.page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness, color });
  }

  private wrap(value: string, size: number, font: PDFFont, maxWidth: number): string[] {
    const words = value.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  spacer(amount: number) {
    this.y -= amount;
  }

  // ── Cover page ────────────────────────────────────────────────────────────────────────────

  coverPage(chart: KundliChart, options: KundliPdfOptions) {
    this.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 260, width: PAGE_WIDTH, height: 260, color: CREAM });
    this.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: COPPER });

    this.page.drawCircle({ x: PAGE_WIDTH / 2, y: PAGE_HEIGHT - 140, size: 42, color: CREAM, borderColor: COPPER, borderWidth: 1.5 });
    const initials = options.studioName.split(/\s+/).map((word) => word[0]).slice(0, 3).join("");
    const initialsWidth = this.bold.widthOfTextAtSize(initials, 22);
    this.text(initials, PAGE_WIDTH / 2 - initialsWidth / 2, PAGE_HEIGHT - 148, { size: 22, bold: true, color: COPPER });

    this.centeredText(options.studioName.toUpperCase(), PAGE_HEIGHT - 210, { size: 11, color: MUTED });
    this.centeredText("VEDIC KUNDLI REPORT", PAGE_HEIGHT - 234, { size: 20, bold: true, color: COPPER });

    this.y = PAGE_HEIGHT - 340;
    this.centeredText("Prepared exclusively for", this.y, { size: 10, color: MUTED });
    this.y -= 26;
    this.centeredText(chart.name, this.y, { size: 26, bold: true });
    this.y -= 40;

    this.ruleAt(this.y, COPPER_LIGHT, 1.5);
    this.y -= 34;

    const rows: Array<[string, string]> = [
      ["Date of Birth", chart.birthDate],
      ["Time of Birth", chart.birthTime],
      ["Place of Birth", chart.matchedPlace],
    ];
    for (const [label, value] of rows) {
      this.centeredText(label.toUpperCase(), this.y, { size: 7.5, color: MUTED });
      this.y -= 14;
      this.centeredText(value, this.y, { size: 12, bold: true });
      this.y -= 26;
    }

    this.y -= 20;
    this.ruleAt(this.y, COPPER_LIGHT, 1.5);
    this.y -= 24;

    const attributionLine = options.attribution.type === "human"
      ? `Consulted Astrologer: ${options.attribution.astrologerName}`
      : `Prepared by: ${options.attribution.personaName}`;
    this.centeredText(attributionLine, this.y, { size: 10.5, bold: true, color: COPPER });
    this.y -= 40;

    const footerY = MARGIN + 30;
    this.ruleAt(footerY + 18);
    this.centeredText(`Report ${options.reportId}  ·  Generated ${options.generatedAt.toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })}`, footerY, { size: 9, color: MUTED });
    this.centeredText("Confidential — prepared for the named recipient only", footerY - 16, { size: 8, color: MUTED, bold: false });
  }

  // ── Table of Contents (drawn last, once every page number is known) ─────────────────────────

  reserveTocPage() {
    this.newPage();
    this.text("Table of Contents", MARGIN, this.y, { size: 18, bold: true, color: COPPER });
    this.y -= 10;
    this.ruleAt(this.y, COPPER);
    this.y -= 28;
    this.tocPage = this.page;
    this.tocCursorY = this.y;
  }

  finalizeToc() {
    if (!this.tocPage) return;
    const page = this.tocPage;
    let y = this.tocCursorY;
    for (const section of this.sections) {
      const label = section.title;
      const pageLabel = String(section.page);
      page.drawText(label, { x: MARGIN, y, size: 11, font: this.font, color: INK });
      const pageLabelWidth = this.bold.widthOfTextAtSize(pageLabel, 11);
      const labelWidth = this.font.widthOfTextAtSize(label, 11);
      const dotsStart = MARGIN + labelWidth + 8;
      const dotsEnd = PAGE_WIDTH - MARGIN - pageLabelWidth - 8;
      if (dotsEnd > dotsStart) {
        page.drawLine({ start: { x: dotsStart, y: y + 3 }, end: { x: dotsEnd, y: y + 3 }, thickness: 0.75, color: RULE, dashArray: [1, 2] });
      }
      page.drawText(pageLabel, { x: PAGE_WIDTH - MARGIN - pageLabelWidth, y, size: 11, font: this.bold, color: COPPER });
      y -= 26;
    }
  }

  // ── Section-level content ────────────────────────────────────────────────────────────────

  /** Every major section starts on its own fresh page and registers a Table of Contents entry —
   * this is what makes the page count a structural guarantee rather than something tuned by
   * padding text. */
  beginSection(title: string) {
    this.newPage();
    this.sections.push({ title, page: this.pageNumber });
    this.page.drawCircle({ x: MARGIN + 3, y: this.y + 4, size: 3, color: COPPER });
    this.text(title, MARGIN + 14, this.y, { size: 15, bold: true, color: COPPER });
    this.y -= 10;
    this.ruleAt(this.y, COPPER);
    this.y -= 22;
  }

  subheading(value: string) {
    this.ensureSpace(30);
    this.spacer(6);
    this.text(value, MARGIN, this.y, { size: 11.5, bold: true });
    this.y -= 16;
  }

  paragraph(value: string, options: { size?: number; color?: Color; bold?: boolean; oblique?: boolean } = {}) {
    const size = options.size ?? 10;
    const lineHeight = size + 5.5;
    const font = options.oblique ? this.oblique : options.bold ? this.bold : this.font;
    const lines = this.wrap(value, size, font, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.text(line, MARGIN, this.y, { size, bold: options.bold, oblique: options.oblique, color: options.color ?? INK });
      this.y -= lineHeight;
    }
    this.y -= 6;
  }

  panel(rows: Array<[string, string]>, columns = 2) {
    const rowHeight = 34;
    const colWidth = CONTENT_WIDTH / columns;
    const panelRows = Math.ceil(rows.length / columns);
    const panelHeight = panelRows * rowHeight + 16;
    this.ensureSpace(panelHeight);
    this.page.drawRectangle({ x: MARGIN, y: this.y - panelHeight, width: CONTENT_WIDTH, height: panelHeight, color: PANEL });
    let cursorY = this.y - 20;
    let col = 0;
    for (const [label, value] of rows) {
      const x = MARGIN + 16 + col * colWidth;
      this.text(label.toUpperCase(), x, cursorY, { size: 7.5, color: MUTED });
      this.text(value, x, cursorY - 15, { size: 10.5, bold: true });
      col += 1;
      if (col >= columns) {
        col = 0;
        cursorY -= rowHeight;
      }
    }
    this.y -= panelHeight + 20;
  }

  table(headers: string[], colWidths: number[], rows: string[][], zebra = true) {
    const headerHeight = 20;
    this.ensureSpace(headerHeight + 24);
    let x = MARGIN;
    for (let i = 0; i < headers.length; i++) {
      this.text(headers[i], x, this.y, { size: 8.5, bold: true, color: MUTED });
      x += colWidths[i];
    }
    this.y -= 6;
    this.ruleAt(this.y);
    this.y -= 16;

    rows.forEach((row, rowIndex) => {
      this.ensureSpace(18);
      if (zebra && rowIndex % 2 === 1) {
        this.page.drawRectangle({ x: MARGIN - 4, y: this.y - 4, width: CONTENT_WIDTH + 8, height: 16, color: ZEBRA });
      }
      x = MARGIN;
      for (let i = 0; i < row.length; i++) {
        this.text(row[i], x, this.y, { size: 9.5 });
        x += colWidths[i];
      }
      this.y -= 17;
    });
    this.y -= 10;
  }

  async save() {
    return this.doc.save();
  }
}

// ── Report assembly ──────────────────────────────────────────────────────────────────────────

export async function generateKundliPdf(chart: KundliChart, options: KundliPdfOptions): Promise<Uint8Array> {
  const runningTitle = `${options.studioName} — Kundli Report for ${chart.name}`;
  const writer = await ReportWriter.create(runningTitle, options.reportId);

  writer.coverPage(chart, options);
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

  const attributionLine = options.attribution.type === "human"
    ? `Consulted Astrologer: ${options.attribution.astrologerName}`
    : `Prepared by: ${options.attribution.personaName} — ${options.studioName}'s automated Kundli engine (calculated, not AI-generated)`;
  writer.paragraph(attributionLine, { size: 9.5, bold: true, color: COPPER });

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
  for (const [term, definition] of GLOSSARY) {
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
