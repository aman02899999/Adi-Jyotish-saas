import { describe, expect, it } from "vitest";

import { practitionerTitle } from "@/components/ai-persona-badge";

describe("practitionerTitle", () => {
  it("removes seniority and credential claims from an AI persona's title", () => {
    expect(practitionerTitle("Senior Vedic Astrologer", true)).toBe("Vedic Astrologer");
    expect(practitionerTitle("Certified Gemstone & Vedic Astrology Expert", true)).toBe("Gemstone & Vedic Astrology Expert");
    expect(practitionerTitle("renowned senior jyotishi", true)).toBe("Jyotishi");
  });

  it("leaves a human astrologer's title exactly as entered", () => {
    expect(practitionerTitle("Senior Vedic Astrologer", false)).toBe("Senior Vedic Astrologer");
    expect(practitionerTitle("Certified Gemstone & Vedic Astrology Expert", undefined)).toBe("Certified Gemstone & Vedic Astrology Expert");
  });

  it("leaves AI titles without such claims untouched", () => {
    expect(practitionerTitle("Kundli Milan Specialist", true)).toBe("Kundli Milan Specialist");
  });

  it("falls back to the AI label rather than showing nothing", () => {
    expect(practitionerTitle("Senior ", true)).toBe("AI astrologer");
  });
});
