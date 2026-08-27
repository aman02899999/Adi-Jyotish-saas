import "server-only";

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { GrahaKey } from "@/lib/astro-engine";
import { pdfSafe, pdfSafeName } from "@/lib/pdf-text";

/**
 * Shared premium-report layout engine, used by kundli-pdf.ts and varshphal-pdf.ts (both real,
 * multi-page astrology reports, not one-line invoices — see invoice-pdf.ts for that separate,
 * simpler template). Pulled out once a second report type needed the identical cover page /
 * table-of-contents / section / table machinery, rather than duplicating ~250 lines per report.
 */

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 56;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export const INK = rgb(0.18, 0.16, 0.14);
export const MUTED = rgb(0.45, 0.4, 0.36);
export const COPPER = rgb(0.663, 0.345, 0.219);
export const COPPER_LIGHT = rgb(0.92, 0.85, 0.78);
export const RULE = rgb(0.85, 0.82, 0.78);
export const PANEL = rgb(0.97, 0.955, 0.93);
export const ZEBRA = rgb(0.955, 0.94, 0.91);
export const CREAM = rgb(0.992, 0.985, 0.975);

export type Color = ReturnType<typeof rgb>;

export type PdfAttribution =
  | { type: "human"; astrologerName: string }
  | { type: "ai"; personaName: string };

/** Renders an attribution as the one line shown on the cover page and again in the chart-overview
 * panel — kept in one place so the two reports phrase it identically. `engineNote` lets each
 * report describe what actually produced it (e.g. "Kundli engine" vs "Varshphal engine") when the
 * attribution is the platform's automated engine rather than a human astrologer. */
export function attributionLine(attribution: PdfAttribution, studioName: string, engineNote: string): string {
  return attribution.type === "human"
    ? `Consulted Astrologer: ${attribution.astrologerName}`
    : `Prepared by: ${attribution.personaName} — ${studioName}'s ${engineNote} (calculated, not AI-generated)`;
}

// ── Classical reference content shared across report types ─────────────────────────────────────
// Standard, widely-published Jyotish material (any astrology textbook covers the same ground) —
// general/classical, not a claim about any specific person beyond what their real chart places
// where.

export const RASHI_TRAITS: string[] = [
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

export const GRAHA_SIGNIFICANCE: Record<GrahaKey, string> = {
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

export const HOUSE_TITLES = [
  "Self & Body", "Wealth & Family", "Courage & Communication", "Home & Comfort", "Children & Creativity",
  "Health & Service", "Partnership & Marriage", "Transformation & Longevity", "Fortune & Dharma",
  "Career & Status", "Gains & Aspirations", "Release & Liberation",
];

export const HOUSE_SIGNIFICATIONS = [
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

export const BASE_GLOSSARY: Array<[string, string]> = [
  ["Lagna (Ascendant)", "The zodiac sign rising on the eastern horizon at the exact reference moment — the point every house in the chart is counted from."],
  ["Rashi", "One of the 12 zodiac signs (30° each) that the Moon, Sun, and every other graha travel through."],
  ["Nakshatra", "One of the 27 lunar constellations (13°20' each) the Moon and other grahas pass through — a finer-grained placement than the rashi alone."],
  ["Pada", "A quarter-division of a nakshatra (3°20' each) — four padas per nakshatra, used for finer timing and matching work."],
  ["Graha", "A classical 'planet' in Jyotish — the Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, plus the lunar nodes Rahu and Ketu."],
  ["Bhava (House)", "One of 12 divisions of a chart counted from its Lagna, each governing a different area of life."],
  ["Retrograde", "A graha's apparent backward motion through the zodiac as seen from Earth — interpretively significant in Jyotish."],
  ["Ayanamsa", "The angular offset between the sidereal (star-fixed) and tropical (season-fixed) zodiacs — this report uses the Lahiri (Chitrapaksha) ayanamsa, the most widely used standard in Vedic astrology."],
  ["Whole Sign Houses", "A house system where each house is exactly one full rashi wide, starting from the Lagna's own sign — the classical Parashari default, used throughout this report."],
];

// ── Layout engine ────────────────────────────────────────────────────────────────────────────

export type CoverPageOptions = {
  studioName: string;
  reportKind: string;
  subjectName: string;
  detailRows: Array<[string, string]>;
  attributionLine: string;
  reportId: string;
  generatedAt: Date;
};

export class ReportWriter {
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
    const right = pdfSafe(`${this.reportId} · Page ${this.pageNumber}`);
    this.text(right, PAGE_WIDTH - MARGIN - this.font.widthOfTextAtSize(right, 8), this.y, { size: 8, color: MUTED });
    this.y -= 14;
    this.ruleAt(this.y);
    this.y -= 22;
  }

  private ensureSpace(height: number) {
    if (this.y - height < MARGIN + 24) this.newPage();
  }

  /** Every glyph this class draws goes through here, so sanitizing at this one point is what
   * makes the whole report engine safe against text pdf-lib's standard fonts cannot encode —
   * see pdf-text.ts. Callers that also *measure* text must sanitize before measuring, so that the
   * width they compute matches the string that actually gets drawn. */
  private text(value: string, x: number, y: number, options: { size?: number; bold?: boolean; oblique?: boolean; color?: Color } = {}) {
    const font = options.oblique ? this.oblique : options.bold ? this.bold : this.font;
    this.page.drawText(pdfSafe(value), { x, y, size: options.size ?? 10, font, color: options.color ?? INK });
  }

  private centeredText(value: string, y: number, options: { size?: number; bold?: boolean; color?: Color } = {}) {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.font;
    const safe = pdfSafe(value);
    const width = font.widthOfTextAtSize(safe, size);
    this.text(safe, (PAGE_WIDTH - width) / 2, y, options);
  }

  private ruleAt(y: number, color: Color = RULE, thickness = 1) {
    this.page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness, color });
  }

  private wrap(value: string, size: number, font: PDFFont, maxWidth: number): string[] {
    const words = pdfSafe(value).split(/\s+/).filter(Boolean);
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

  coverPage(options: CoverPageOptions) {
    this.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 260, width: PAGE_WIDTH, height: 260, color: CREAM });
    this.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: COPPER });

    this.page.drawCircle({ x: PAGE_WIDTH / 2, y: PAGE_HEIGHT - 140, size: 42, color: CREAM, borderColor: COPPER, borderWidth: 1.5 });
    const initials = pdfSafe(options.studioName).split(/\s+/).map((word) => word[0] ?? "").slice(0, 3).join("");
    const initialsWidth = this.bold.widthOfTextAtSize(initials, 22);
    this.text(initials, PAGE_WIDTH / 2 - initialsWidth / 2, PAGE_HEIGHT - 148, { size: 22, bold: true, color: COPPER });

    this.centeredText(options.studioName.toUpperCase(), PAGE_HEIGHT - 210, { size: 11, color: MUTED });
    this.centeredText(options.reportKind, PAGE_HEIGHT - 234, { size: 20, bold: true, color: COPPER });

    this.y = PAGE_HEIGHT - 340;
    this.centeredText("Prepared exclusively for", this.y, { size: 10, color: MUTED });
    this.y -= 26;
    this.centeredText(pdfSafeName(options.subjectName), this.y, { size: 26, bold: true });
    this.y -= 40;

    this.ruleAt(this.y, COPPER_LIGHT, 1.5);
    this.y -= 34;

    for (const [label, value] of options.detailRows) {
      this.centeredText(label.toUpperCase(), this.y, { size: 7.5, color: MUTED });
      this.y -= 14;
      this.centeredText(value, this.y, { size: 12, bold: true });
      this.y -= 26;
    }

    this.y -= 20;
    this.ruleAt(this.y, COPPER_LIGHT, 1.5);
    this.y -= 24;

    this.centeredText(options.attributionLine, this.y, { size: 10.5, bold: true, color: COPPER });
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
      const label = pdfSafe(section.title);
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
