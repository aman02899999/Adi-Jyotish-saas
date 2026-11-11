import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for two rules that are about what a customer is shown, so they are checked against the
 * page source itself: every AI reading says it is AI, and no price is shown crossed out unless
 * that higher price is a real one somebody could have been charged.
 */
const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const AI_READING_PAGES = [
  "ask",
  "palm-reading",
  "tarot-reading",
  "face-reading",
  "vastu-consultation",
  "lal-kitab-reading",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(path.join(root, file)).isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

describe("AI disclosure on the paid AI reading pages", () => {
  for (const page of AI_READING_PAGES) {
    const source = read(`src/app/[locale]/${page}/page.tsx`);

    it(`/${page} labels the persona as AI on its card`, () => {
      expect(source).toContain("<AiReadingBadge");
    });

    it(`/${page} says the reading is AI-generated next to the form that takes payment`, () => {
      expect(source).toMatch(/<AiReadingNotice\s+name="[^"]+"/);
    });

    it(`/${page} says AI in the title search engines and shared links show`, () => {
      const titles = [...source.matchAll(/title: "([^"]+)"/g)].map((match) => match[1]);
      expect(titles.length).toBeGreaterThan(0);
      for (const title of titles) expect(title).toMatch(/\bAI\b/);
    });
  }
});

describe("crossed-out prices", () => {
  const files = sourceFiles("src");

  it("no AI astrologer price is shown against an invented original price", () => {
    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toMatch(/sessionOriginalPrice|computeSessionPriceAnchor/);
    }
  });

  it("no AI reading carries a discount anchor that was never charged", () => {
    for (const file of files) {
      expect(read(file), file).not.toMatch(/AI_[A-Z_]+_ORIGINAL_PRICE/);
    }
  });
});

describe("plan badge", () => {
  it("does not claim a plan is the most chosen without a count behind it", () => {
    for (const file of sourceFiles("src")) {
      expect(read(file), file).not.toMatch(/most chosen/i);
    }
  });
});
