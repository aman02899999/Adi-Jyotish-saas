import "server-only";

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { GRAHA_LABELS, NAKSHATRAS, RASHIS, formatDegree } from "@/lib/astro-engine";
import { detectDoshas } from "@/lib/dosha-engine";
import { buildHouseGrid, renderKundliReport, type KundliChart } from "@/lib/kundli-engine";

/**
 * A real, multi-page Kundli report document — the kind a practitioner would actually hand a
 * client, not a one-line invoice. Uses the exact same chart data (astro-engine.ts + dosha-engine.ts)
 * and the exact same narrative text (renderKundliReport) shown on the website, so the PDF can never
 * drift from what the member/practitioner already sees on screen. No AI involved in producing this
 * document — every number and sentence here comes from the deterministic engine.
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.18, 0.16, 0.14);
const MUTED = rgb(0.45, 0.4, 0.36);
const COPPER = rgb(0.663, 0.345, 0.219);
const RULE = rgb(0.85, 0.82, 0.78);
const PANEL = rgb(0.97, 0.955, 0.93);

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

/** Same section markers renderKundliReport() actually emits — kept in sync with kundli-engine.ts
 * so this PDF's narrative text is always identical to what the website shows, never a paraphrase
 * that could drift. (kundli-report-form.tsx has its own copy of this list for the on-screen
 * version; both must include "Doshas" or that section silently loses its heading.) */
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

class ReportWriter {
  private doc!: PDFDocument;
  private page!: PDFPage;
  private font!: PDFFont;
  private bold!: PDFFont;
  private y = 0;
  private pageNumber = 0;
  private readonly runningTitle: string;

  private constructor(runningTitle: string) {
    this.runningTitle = runningTitle;
  }

  static async create(runningTitle: string) {
    const writer = new ReportWriter(runningTitle);
    writer.doc = await PDFDocument.create();
    writer.font = await writer.doc.embedFont(StandardFonts.Helvetica);
    writer.bold = await writer.doc.embedFont(StandardFonts.HelveticaBold);
    writer.newPage();
    return writer;
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pageNumber += 1;
    this.y = PAGE_HEIGHT - MARGIN;
    if (this.pageNumber > 1) {
      this.text(this.runningTitle, MARGIN, this.y, { size: 8.5, color: MUTED });
      const pageLabel = `Page ${this.pageNumber}`;
      this.text(pageLabel, PAGE_WIDTH - MARGIN - this.font.widthOfTextAtSize(pageLabel, 8.5), this.y, { size: 8.5, color: MUTED });
      this.y -= 16;
      this.ruleAt(this.y);
      this.y -= 18;
    }
  }

  private ensureSpace(height: number) {
    if (this.y - height < MARGIN + 24) this.newPage();
  }

  private text(value: string, x: number, y: number, options: { size?: number; bold?: boolean; color?: Color } = {}) {
    this.page.drawText(value, { x, y, size: options.size ?? 10, font: options.bold ? this.bold : this.font, color: options.color ?? INK });
  }

  private ruleAt(y: number, color: Color = RULE) {
    this.page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color });
  }

  private wrap(value: string, size: number, bold: boolean, maxWidth: number): string[] {
    const font = bold ? this.bold : this.font;
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

  brandHeader(studioName: string, supportEmail: string, reportId: string, generatedAt: Date) {
    this.text(studioName, MARGIN, this.y, { size: 22, bold: true, color: COPPER });
    const idLabel = `Report ${reportId}`;
    this.text(idLabel, PAGE_WIDTH - MARGIN - this.bold.widthOfTextAtSize(idLabel, 11), this.y, { size: 11, bold: true });
    this.y -= 16;
    this.text("Vedic Kundli Report — Full Birth Chart Analysis", MARGIN, this.y, { size: 11, color: MUTED });
    const dateLabel = generatedAt.toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" });
    this.text(dateLabel, PAGE_WIDTH - MARGIN - this.font.widthOfTextAtSize(dateLabel, 9), this.y, { size: 9, color: MUTED });
    this.y -= 12;
    this.text(supportEmail, MARGIN, this.y, { size: 8.5, color: MUTED });
    this.y -= 18;
    this.ruleAt(this.y, COPPER);
    this.y -= 24;
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

  sectionHeading(value: string) {
    this.ensureSpace(36);
    this.text(value, MARGIN, this.y, { size: 13, bold: true, color: COPPER });
    this.y -= 8;
    this.ruleAt(this.y);
    this.y -= 18;
  }

  paragraph(value: string, options: { size?: number; color?: Color; bold?: boolean } = {}) {
    const size = options.size ?? 10;
    const lineHeight = size + 5.5;
    const lines = this.wrap(value, size, Boolean(options.bold), CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.text(line, MARGIN, this.y, { size, bold: options.bold, color: options.color ?? INK });
      this.y -= lineHeight;
    }
    this.y -= 6;
  }

  table(headers: string[], colWidths: number[], rows: string[][]) {
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

    for (const row of rows) {
      this.ensureSpace(18);
      x = MARGIN;
      for (let i = 0; i < row.length; i++) {
        this.text(row[i], x, this.y, { size: 9.5 });
        x += colWidths[i];
      }
      this.y -= 17;
    }
    this.y -= 10;
  }

  footerNote(value: string) {
    this.ensureSpace(20);
    this.paragraph(value, { size: 8, color: MUTED });
  }

  async save() {
    return this.doc.save();
  }
}

export async function generateKundliPdf(chart: KundliChart, options: KundliPdfOptions): Promise<Uint8Array> {
  const runningTitle = `${options.studioName} — Kundli Report for ${chart.name}`;
  const writer = await ReportWriter.create(runningTitle);

  writer.brandHeader(options.studioName, options.supportEmail, options.reportId, options.generatedAt);

  writer.panel([
    ["Client", chart.name],
    ["Status", "Paid & Confirmed"],
    ["Date of Birth", chart.birthDate],
    ["Time of Birth", chart.birthTime],
    ["Place of Birth", chart.matchedPlace],
    ["Methodology", "Sidereal (Vedic) · Lahiri Ayanamsa · Whole Sign Houses"],
  ]);

  const attributionLine = options.attribution.type === "human"
    ? `Consulted Astrologer: ${options.attribution.astrologerName}`
    : `Prepared by: ${options.attribution.personaName} — ${options.studioName}'s automated Kundli engine (calculated, not AI-generated)`;
  writer.paragraph(attributionLine, { size: 9.5, bold: true, color: COPPER });

  const moon = chart.positions.find((p) => p.graha === "moon")!;
  const sun = chart.positions.find((p) => p.graha === "sun")!;
  writer.sectionHeading("Lagna, Rashi & Nakshatra");
  writer.panel([
    ["Lagna (Ascendant)", `${RASHIS[chart.ascendantRashiIndex].name} — ${formatDegree(chart.ascendantDegree)}`],
    ["Moon Sign (Rashi)", RASHIS[moon.rashiIndex].name],
    ["Moon Nakshatra", `${NAKSHATRAS[moon.nakshatraIndex]}, Pada ${moon.pada}`],
    ["Sun Sign (Rashi)", RASHIS[sun.rashiIndex].name],
  ]);

  writer.sectionHeading("Planetary Positions (Graha Sphuta)");
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

  writer.sectionHeading("Bhava Chart (Houses from Lagna)");
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

  const doshas = detectDoshas(chart);
  writer.sectionHeading("Doshas");
  writer.paragraph(
    doshas.mangal.present
      ? doshas.mangal.cancelled
        ? `Mangal Dosha (Manglik): present but classically cancelled — Mars is in house ${doshas.mangal.houseFromLagna} from Lagna, and ${doshas.mangal.cancellationReason}`
        : `Mangal Dosha (Manglik): present — Mars is in house ${doshas.mangal.houseFromLagna} from Lagna. Traditionally weighed in marriage matching.`
      : `Mangal Dosha (Manglik): not present.`,
  );
  writer.paragraph(
    doshas.kaalSarp.present
      ? `Kaal Sarp Dosha: present (${doshas.kaalSarp.name}).`
      : `Kaal Sarp Dosha: not present.`,
  );
  writer.paragraph(
    doshas.sadeSati.active
      ? `Sade Sati: currently active, ${doshas.sadeSati.phase} phase.`
      : `Sade Sati: not currently active.`,
  );

  const narrative = parseNarrativeSections(renderKundliReport(chart));
  for (const section of narrative) {
    if (section.heading === "Doshas") continue; // already rendered above as structured data
    writer.sectionHeading(section.heading);
    writer.paragraph(section.body);
  }

  writer.spacer(10);
  writer.footerNote(
    `This report is calculated using the selected astrological methodology (sidereal/Vedic, Lahiri ayanamsa, whole-sign houses) — it is traditional/cultural guidance, not a scientific or guaranteed prediction. For health, legal, financial, or other high-stakes decisions, consult a qualified professional. Generated securely by ${options.studioName}. Questions? Contact ${options.supportEmail}.`,
  );

  return writer.save();
}
