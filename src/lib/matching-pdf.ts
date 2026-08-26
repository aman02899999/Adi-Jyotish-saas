import "server-only";

import type { AshtakootBreakdown, AshtakootResult } from "@/lib/ashtakoot";
import type { KundliMatchRecord } from "@/lib/kundli-matching";
import { scoreTier } from "@/lib/kundli-matching";
import {
  attributionLine, BASE_GLOSSARY, COPPER, MUTED, type PdfAttribution, ReportWriter,
} from "@/lib/report-writer";
import { pdfSafeName } from "@/lib/pdf-text";

/**
 * The compatibility-matching counterpart to kundli-pdf.ts / varshphal-pdf.ts, built on the same
 * shared layout engine (report-writer.ts). Every score and koota value comes straight from the
 * real Ashtakoot engine (ashtakoot.ts); the koota reference descriptions below are standard,
 * widely-published classical Jyotish material, not invented for any specific pair. The narrative
 * and 12-month timeline are the exact same content already shown on the website (createKundliMatch
 * persists them; this PDF reads the persisted values rather than recomputing separate prose), so
 * the PDF can never say something different from what the member already saw on screen.
 */

const KOOTA_META: Array<{ key: keyof AshtakootBreakdown; label: string; max: number; about: string; meaning: string }> = [
  { key: "varna", label: "Varna", max: 1, about: "spiritual temperament and ego", meaning: "Checks whether one partner's natural temperament sits at or above the other's in the classical Varna hierarchy — a light-touch koota, worth only 1 point." },
  { key: "vashya", label: "Vashya", max: 2, about: "mutual influence and control in the relationship", meaning: "Looks at which partner tends to naturally hold more sway in the relationship's day-to-day dynamic." },
  { key: "tara", label: "Tara", max: 3, about: "general wellbeing and destiny alignment", meaning: "Based on the nakshatra distance between both Moons — a broad read on shared luck and general wellbeing." },
  { key: "yoni", label: "Yoni", max: 4, about: "physical and intimate compatibility", meaning: "A symbolic-animal compatibility system tied to nakshatra, read classically as physical and intimate compatibility." },
  { key: "grahaMaitri", label: "Graha Maitri", max: 5, about: "mental compatibility and intellectual rapport", meaning: "Based on the classical friendship (or enmity) between the planetary lords of both Moon signs — a read on mental rapport." },
  { key: "gana", label: "Gana", max: 6, about: "basic temperament and nature", meaning: "Classifies each nakshatra into one of three temperament groups (deva, manushya, rakshasa) and compares them." },
  { key: "bhakoot", label: "Bhakoot", max: 7, about: "emotional bond and financial prosperity", meaning: "Based on the sign distance between both Moons — one of the two heaviest-weighted kootas, tied to emotional and financial harmony." },
  { key: "nadi", label: "Nadi", max: 8, about: "health, genetics, and progeny", meaning: "The single heaviest-weighted koota (8 of 36 points) — classically tied to health, genetic compatibility, and children." },
];

const MATCHING_GLOSSARY: Array<[string, string]> = [
  ["Ashtakoot Guna Milan", "The classical eight-factor (\"ashta koota\") Vedic compatibility system, scored out of 36 points, used to assess a pairing before marriage."],
  ["Koota", "One of the eight individual compatibility factors that make up the Ashtakoot system, each scored on its own point scale and summed to the total."],
  ["Nadi Dosha", "A specific concern flagged when the Nadi koota scores zero — the heaviest-weighted koota, classically tied to health and progeny — though recognized classical exceptions can exempt certain cases."],
  ["Bhakoot Dosha", "A specific concern flagged when the Bhakoot koota scores zero — tied to emotional and financial harmony — though recognized classical exceptions can exempt certain cases."],
  ...BASE_GLOSSARY.filter(([term]) => term === "Rashi" || term === "Nakshatra" || term === "Pada" || term === "Ayanamsa"),
];

export type MatchingPdfOptions = {
  reportId: string;
  generatedAt: Date;
  studioName: string;
  supportEmail: string;
  attribution: PdfAttribution;
};

export async function generateMatchingPdf(
  record: KundliMatchRecord,
  result: AshtakootResult,
  moons: { moonARashi: string; moonANakshatra: string; moonBRashi: string; moonBNakshatra: string },
  options: MatchingPdfOptions,
): Promise<Uint8Array> {
  // Both names are resolved to a drawable form *before* being composed into any sentence. The
  // report writer sanitizes whatever it is handed, but by then "रवि & Priya" has already become
  // " & Priya" — a cover page reading "& Priya Sharma" and a panel headed "'s Moon". Substituting
  // per name keeps every composed string grammatical whatever script the names are written in.
  const nameA = pdfSafeName(record.nameA, "Partner A");
  const nameB = pdfSafeName(record.nameB, "Partner B");
  const runningTitle = `${options.studioName} — ${nameA} & ${nameB} Compatibility Report`;
  const writer = await ReportWriter.create(runningTitle, options.reportId);
  const attribution = attributionLine(options.attribution, options.studioName, "automated matching engine");
  const tier = scoreTier(result.totalScore);

  writer.coverPage({
    studioName: options.studioName,
    reportKind: "COMPATIBILITY MATCHING REPORT",
    subjectName: `${nameA} & ${nameB}`,
    detailRows: [
      ["Guna Milan Score", `${result.totalScore} / ${result.maxScore}`],
      ["Classical Verdict", tier.label],
      [`${nameA}'s Moon`, `${moons.moonARashi} · ${moons.moonANakshatra}`],
      [`${nameB}'s Moon`, `${moons.moonBRashi} · ${moons.moonBNakshatra}`],
    ],
    attributionLine: attribution,
    reportId: options.reportId,
    generatedAt: options.generatedAt,
  });
  writer.reserveTocPage();

  // 1. About This Report
  writer.beginSection("About This Report");
  writer.paragraph(
    `This is a classical Ashtakoot Guna Milan compatibility report — the traditional Vedic system for assessing a pairing before marriage. Both people's Moon positions are calculated from their real birth details (sidereal zodiac, Lahiri ayanamsa), then scored across eight kootas (factors), each weighted differently, for a maximum of 36 points. The traditional minimum considered workable is 18 points.`,
  );
  writer.paragraph(
    `Guna Milan is one traditional input among many — it reflects a specific classical methodology, not a scientific compatibility measurement or a guarantee of relationship success. It should sit alongside the couple's own values, communication, and compatibility, not replace them.`,
    { oblique: true, color: MUTED },
  );

  // 2. Score Overview
  writer.beginSection("Score Overview");
  writer.panel([
    [nameA, `Born ${record.birthDateA} · ${record.birthTimeA}`],
    ["Birthplace A", record.birthPlaceA],
    [nameB, `Born ${record.birthDateB} · ${record.birthTimeB}`],
    ["Birthplace B", record.birthPlaceB],
  ]);
  writer.paragraph(attribution, { size: 9.5, bold: true, color: COPPER });
  writer.subheading(`${result.totalScore} out of ${result.maxScore} — ${tier.label}`);
  writer.paragraph(tier.guidance);
  writer.subheading("Moon Placements");
  writer.paragraph(
    `${nameA}'s Moon is in ${moons.moonARashi}, ${moons.moonANakshatra} nakshatra. ${nameB}'s Moon is in ${moons.moonBRashi}, ${moons.moonBNakshatra} nakshatra. Every koota below is derived from these two placements.`,
  );

  // 3. Koota-by-Koota Breakdown
  writer.beginSection("Koota-by-Koota Breakdown");
  writer.paragraph(`How this pair scored on each of the eight classical factors.`);
  writer.table(
    ["Koota", "Score", "Max", "About"],
    [100, 45, 40, 0],
    KOOTA_META.map((koota) => [koota.label, String(result.breakdown[koota.key]), String(koota.max), koota.about]),
  );

  for (const koota of KOOTA_META) {
    const score = result.breakdown[koota.key];
    writer.subheading(`${koota.label} — ${score}/${koota.max}`);
    const resultLine = score === koota.max
      ? "This pair scored full points here — a real strength."
      : score === 0
        ? "This pair scored zero here — classical texts flag this koota as worth extra attention (see Doshas, next section, if this is Nadi or Bhakoot)."
        : "This pair scored partial points here — a mixed but not concerning result.";
    writer.paragraph(`${koota.meaning} ${resultLine}`);
  }

  // 4. Doshas
  writer.beginSection("Doshas");
  writer.paragraph(
    `Of the eight kootas, two carry a specific named "dosha" when they score zero — Nadi and Bhakoot — because classical texts weigh them most heavily. Both are checked here directly from this pair's real koota scores, including the recognized classical exceptions that can exempt a zero score from counting as a real dosha.`,
  );
  writer.subheading("Nadi Dosha");
  writer.paragraph(
    result.nadiDosha
      ? `Present — the Nadi koota scored zero and no classical exemption applies. This is the koota classical texts weigh most heavily; worth discussing with a priest before proceeding.`
      : result.breakdown.nadi === 0
        ? `Not counted as a dosha — the Nadi koota scored zero mechanically, but this specific case (same nakshatra, different pada) is a recognized classical exemption.`
        : `Not present — the Nadi koota did not score zero for this pair.`,
    { bold: true },
  );
  writer.subheading("Bhakoot Dosha");
  writer.paragraph(
    result.bhakootDosha
      ? `Present — the Bhakoot koota scored zero and no classical exemption applies. Worth discussing with a priest before proceeding.`
      : result.breakdown.bhakoot === 0
        ? `Not counted as a dosha — the Bhakoot koota scored zero mechanically, but this specific case (both Moon signs share the same ruling planet) is a recognized classical exemption.`
        : `Not present — the Bhakoot koota did not score zero for this pair.`,
    { bold: true },
  );

  // 5. Compatibility Summary
  writer.beginSection("Compatibility Summary");
  for (const paragraph of record.narrative.split(/\n{2,}/)) {
    writer.paragraph(paragraph);
  }

  // 6. 12-Month Compatibility Timeline
  writer.beginSection("12-Month Compatibility Timeline");
  writer.paragraph(
    `Real Jupiter, Venus, and Saturn transits checked against both natal Moons, month by month — not a static score, but when the sky actually favors this pairing over the year ahead.`,
  );
  writer.table(
    ["Month", "Outlook", "Note"],
    [80, 80, 0],
    record.timeline.map((month) => [month.monthLabel, month.tier.charAt(0).toUpperCase() + month.tier.slice(1), month.headline]),
  );

  // 7. Glossary
  writer.beginSection("Glossary of Terms");
  writer.paragraph("A quick reference for the classical terms used throughout this report.");
  for (const [term, definition] of MATCHING_GLOSSARY) {
    writer.subheading(term);
    writer.paragraph(definition);
  }

  // 8. Closing
  writer.beginSection(`About ${options.studioName}`);
  writer.paragraph(
    `${options.studioName} brings together real astronomical calculation (not AI guesswork) with classical Jyotish methodology to produce charts, matching reports, and consultations you can actually trust the numbers behind. Every Kundli, Varshphal, and matching report on the platform is computed the same way this one was — deterministically, from real birth data.`,
  );
  writer.subheading("Methodology & Versioning");
  writer.paragraph(
    `Ayanamsa: Lahiri (Chitrapaksha). Zodiac: Sidereal (Vedic). Compatibility system: classical Ashtakoot Guna Milan (8 kootas, 36-point maximum). Report ID ${options.reportId}, generated ${options.generatedAt.toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })}.`,
  );
  writer.subheading("Disclaimer");
  writer.paragraph(
    `This report is calculated using the selected astrological methodology — it is traditional/cultural guidance, not a scientific or guaranteed prediction of relationship success. For major life decisions, please use your own judgment alongside the people involved.`,
    { oblique: true, color: MUTED },
  );
  writer.subheading("Questions?");
  writer.paragraph(`Contact ${options.supportEmail}. Generated securely by ${options.studioName}.`);

  writer.finalizeToc();

  return writer.save();
}
