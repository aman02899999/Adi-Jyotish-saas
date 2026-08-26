import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { isPdfEncodable, pdfSafe, pdfSafeName } from "@/lib/pdf-text";
import { generateKundliPdf } from "@/lib/kundli-pdf";
import { generateVarshphalPdf } from "@/lib/varshphal-pdf";
import { buildKundliChart } from "@/lib/kundli-engine";
import { buildVarshphalChart } from "@/lib/varshphal";

const reportOptions = {
  reportId: "TEST-1",
  generatedAt: new Date("2026-08-26T10:00:00Z"),
  studioName: "Adi Jyotish Guru",
  supportEmail: "care@adijyotishgurus.com",
  attribution: { type: "ai" as const, personaName: "Acharya Devraj" },
};

/**
 * Names that are entirely ordinary for this platform's audience but sit outside WinAnsi, which is
 * all the standard PDF fonts can encode. Before pdf-text.ts these did not render badly — they
 * threw, turning every report download for that member into a 500.
 */
const HOSTILE_NAMES = [
  "रवि कुमार",         // Devanagari — the site ships a Hindi locale, so this is expected input
  "Priya ₹ Sharma", // rupee sign, which appears throughout this platform's pricing copy
  "अमन 🙏 Sharma", // mixed script plus an emoji
  "Ashwin Iyer",       // plain ASCII control case
  "José Peña-Núñez",   // Latin-1 accents, which WinAnsi *can* encode and must be preserved
];

describe("pdfSafe", () => {
  it("admits only code points pdf-lib's standard font can actually encode", async () => {
    // ENCODABLE is a hand-written table, and a wrong entry in it would only ever surface as a
    // production 500 on someone's download. So rather than trust the table, every code point it
    // admits is pushed through the real encoder here.
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const rejected: string[] = [];
    for (let codePoint = 0x20; codePoint <= 0xffff; codePoint++) {
      if (!isPdfEncodable(codePoint)) continue;
      try {
        font.widthOfTextAtSize(String.fromCodePoint(codePoint), 10);
      } catch {
        rejected.push(`U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`);
      }
    }
    expect(rejected).toEqual([]);
  });

  it("leaves every character it emits encodable, for any input", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const samples = [
      ...HOSTILE_NAMES,
      "℞ 13°20′ — “quoted” … 100% ½",
      " control characters",
      "",
    ];
    for (const sample of samples) {
      expect(() => font.widthOfTextAtSize(pdfSafe(sample), 10), JSON.stringify(sample)).not.toThrow();
    }
  });

  it("rewrites the rupee sign rather than dropping the price", () => {
    expect(pdfSafe("₹1,499 per session")).toBe("Rs.1,499 per session");
  });

  it("keeps Latin-1 accents intact instead of stripping them", () => {
    expect(pdfSafe("José Peña-Núñez")).toBe("José Peña-Núñez");
  });

  it("does not leave doubled spaces where it dropped characters", () => {
    expect(pdfSafe("Aman रवि Sharma")).toBe("Aman Sharma");
  });

  it("falls back rather than addressing a report to an empty name", () => {
    expect(pdfSafeName("रवि कुमार")).toBe("Valued Client");
    expect(pdfSafeName("Ravi Kumar")).toBe("Ravi Kumar");
  });
});

describe("report generators survive un-encodable names", () => {
  for (const name of HOSTILE_NAMES) {
    it(`builds a Kundli PDF for ${JSON.stringify(name)}`, async () => {
      const chart = buildKundliChart({ name, birthDate: "1992-04-17", birthTime: "06:45", birthPlace: "Jaipur, India" });
      const bytes = await generateKundliPdf(chart, reportOptions);
      expect(bytes.length).toBeGreaterThan(1000);
    });

    it(`builds a Varshphal PDF for ${JSON.stringify(name)}`, async () => {
      const chart = buildVarshphalChart({ birthDate: "1992-04-17", birthTime: "06:45", birthPlace: "Jaipur, India", year: 2026 });
      const bytes = await generateVarshphalPdf(chart, name, reportOptions);
      expect(bytes.length).toBeGreaterThan(1000);
    });
  }
});
