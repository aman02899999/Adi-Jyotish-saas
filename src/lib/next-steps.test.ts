import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NEXT_STEPS, type NextStepKey } from "@/lib/next-steps";

/**
 * Every public page that used to end without a way forward now ends with one. These guards keep
 * that true: each step leads to a page that exists, reads the same in English and Hindi, and
 * never leans on urgency, invented discounts or promised outcomes to get the tap.
 */
const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const messages = (locale: string) => JSON.parse(read(`messages/${locale}.json`)).NextStep as Record<string, Record<string, string>>;
const keys = Object.keys(NEXT_STEPS) as NextStepKey[];

describe("next steps", () => {
  it("gives every page one main step and one alternative that lead somewhere different", () => {
    for (const key of keys) {
      const { primary, secondary } = NEXT_STEPS[key];
      expect(primary.href, key).not.toBe(secondary.href);
      expect(primary.event, key).toMatch(/^next_step_/);
    }
  });

  it("only links to pages that exist", () => {
    for (const key of keys) {
      for (const link of [NEXT_STEPS[key].primary, NEXT_STEPS[key].secondary]) {
        const route = link.href.split(/[?#]/)[0].replace(/\/$/, "");
        expect(existsSync(path.join(root, "src/app/[locale]", route, "page.tsx")), `${key}: ${link.href}`).toBe(true);
      }
    }
  });

  it("has the same copy keys in English and Hindi for every step", () => {
    const en = messages("en");
    const hi = messages("hi");
    for (const key of keys) {
      for (const field of ["title", "body", "primary", "secondary"]) {
        expect(en[key]?.[field], `en ${key}.${field}`).toBeTruthy();
        expect(hi[key]?.[field], `hi ${key}.${field}`).toBeTruthy();
      }
    }
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  });

  it("says a paid AI answer is AI before the tap", () => {
    for (const locale of ["en", "hi"]) {
      const copy = messages(locale);
      for (const key of keys) {
        for (const slot of ["primary", "secondary"] as const) {
          if (NEXT_STEPS[key][slot].href.split(/[?#]/)[0] === "/ask") expect(copy[key][slot], `${locale} ${key}.${slot}`).toMatch(/\bAI\b/);
        }
      }
    }
  });

  it("uses no urgency, invented discount or promised outcome", () => {
    const banned = /hurry|last chance|only \d+ left|limited time|ends (today|tonight|soon)|% off|guarantee|100%|accurate|jaldi karein|sirf aaj|pakka/i;
    for (const locale of ["en", "hi"]) {
      for (const [key, copy] of Object.entries(messages(locale))) {
        for (const [field, text] of Object.entries(copy)) expect(text, `${locale} ${key}.${field}`).not.toMatch(banned);
      }
    }
  });
});

describe("pages that end with a next step", () => {
  const pages: Record<string, string> = {
    about: "src/app/[locale]/about/page.tsx",
    blogPost: "src/app/[locale]/blog/[slug]/page.tsx",
    festivals: "src/app/[locale]/festivals/page.tsx",
    horoscope: "src/app/[locale]/horoscope/page.tsx",
    panchang: "src/app/[locale]/panchang/page.tsx",
    numerology: "src/app/[locale]/numerology/page.tsx",
    muhurat: "src/app/[locale]/muhurat/page.tsx",
    kundliMatching: "src/app/[locale]/kundli-matching/page.tsx",
  };

  it("covers every configured step", () => {
    expect(Object.keys(pages).sort()).toEqual([...keys].sort());
  });

  it.each(Object.entries(pages))("%s renders its next step", (key, file) => {
    expect(read(file)).toContain(`<NextStep page="${key}"`);
  });
});

describe("the free chart is not typed twice", () => {
  it("prefills the birth profile from the free chart after sign-up", () => {
    expect(read("src/components/member-onboarding-form.tsx")).toContain("FREE_CHART_BIRTH_KEY");
  });
});
