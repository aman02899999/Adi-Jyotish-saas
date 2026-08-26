import "server-only";

/**
 * Makes arbitrary text safe to draw with pdf-lib's StandardFonts.
 *
 * The standard 14 PDF fonts are encoded in WinAnsi (CP1252), and pdf-lib *throws* — rather than
 * substituting a glyph — the moment it is asked to draw or measure a character outside it:
 * `Error: WinAnsi cannot encode "र" (0x0930)`. Every report the platform produces embeds
 * user-supplied text (a member's name, a birth place, an invoice description, the studio name from
 * admin settings), so without this an unremarkable name like "रवि कुमार" turns a PDF download into
 * a 500 with nothing rendered at all. The site ships a Hindi locale, so that input is expected,
 * not exotic.
 *
 * A degraded glyph beats a failed download, so this never throws: known symbols are rewritten to
 * a WinAnsi equivalent, and anything still unencodable is dropped. See ENCODABLE below — a unit
 * test walks every code point it admits through pdf-lib itself, so the table cannot drift from
 * what the library will actually accept.
 *
 * NOTE: dropping is a floor, not real support. Rendering Devanagari properly needs a Unicode
 * font embedded via @pdf-lib/fontkit instead of a standard font.
 */

/** Rewrites for characters that have a sensible WinAnsi spelling, applied before anything is
 * dropped. Currency is the important one: ₹ appears throughout this platform's pricing copy. */
const REWRITES: Array<[RegExp, string]> = [
  [/[₹₨]/g, "Rs."],   // ₹ Indian rupee sign, ₨ rupee sign
  [/℞/g, "(R)"],           // ℞ — used as the retrograde marker elsewhere in the app
  [/[‐‑]/g, "-"],     // hyphen, non-breaking hyphen → ASCII hyphen
  [/[‒―]/g, "–"],// figure dash, horizontal bar → en dash (which IS WinAnsi)
  [/[   ]/g, " "],// non-breaking / figure / narrow no-break space → plain space
  [/′/g, "'"],             // ′ prime — appears in nakshatra spans like 13°20'
  [/″/g, '"'],             // ″ double prime
  [/[−]/g, "-"],           // − minus sign
];

/**
 * Exactly the code points WinAnsiEncoding defines: ASCII printable, the CP1252 0x80–0x9F block,
 * and Latin-1 0xA0–0xFF. Kept as an explicit set rather than a range check because the 0x80–0x9F
 * block is the one place CP1252 diverges from Latin-1, and three of its slots are undefined.
 */
const CP1252_HIGH = [
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
];

const ENCODABLE = new Set<number>([
  ...Array.from({ length: 0x7E - 0x20 + 1 }, (_, i) => 0x20 + i),
  ...Array.from({ length: 0xFF - 0xA0 + 1 }, (_, i) => 0xA0 + i),
  ...CP1252_HIGH,
]);

export function isPdfEncodable(codePoint: number) {
  return ENCODABLE.has(codePoint);
}

/** Returns `value` with every character pdf-lib cannot draw either rewritten or removed.
 *
 * Accepts null/undefined even though the call sites are typed `string`: this is the last thing
 * standing between a nullable Firestore field and a 500 on a member's download, and a report with
 * one blank line beats no report at all. */
export function pdfSafe(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  let out = value;
  for (const [pattern, replacement] of REWRITES) out = out.replace(pattern, replacement);

  let kept = "";
  for (const character of out) {
    const codePoint = character.codePointAt(0)!;
    if (ENCODABLE.has(codePoint)) kept += character;
  }
  // Dropping a run of unencodable characters can leave doubled or dangling spaces behind.
  return kept.replace(/\s+/g, " ").trim();
}

/**
 * For the few places a name *is* the document — the cover page's subject, the invoice's bill-to,
 * the running header. A name written entirely in a non-Latin script sanitizes to nothing, and a
 * report addressed to a blank space reads as broken; this keeps the page coherent instead.
 */
export function pdfSafeName(value: string | null | undefined, fallback = "Valued Client"): string {
  const safe = pdfSafe(value);
  return /[A-Za-z0-9]/.test(safe) ? safe : fallback;
}
