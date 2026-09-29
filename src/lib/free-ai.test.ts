import { afterEach, describe, expect, it, vi } from "vitest";

import { freeAiReadingsEnabled, isPersonaOffered } from "@/lib/free-ai";

/** Free AI readings spend Gemini quota with no payment behind them, so they must be off unless the
 * studio opts in with exactly "true". */
describe("free AI readings switch", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off when unset, empty, or anything but exactly \"true\"", () => {
    for (const value of [undefined, "", "1", "yes", "TRUE", "false"]) {
      vi.stubEnv("ALLOW_FREE_AI_READINGS", value as string);
      expect(freeAiReadingsEnabled()).toBe(false);
    }
    vi.stubEnv("ALLOW_FREE_AI_READINGS", "true");
    expect(freeAiReadingsEnabled()).toBe(true);
  });

  it("hides a price-0 persona while off, and never hides a paid or inactive one wrongly", () => {
    vi.stubEnv("ALLOW_FREE_AI_READINGS", "");
    expect(isPersonaOffered({ active: true, price: 0 })).toBe(false);
    expect(isPersonaOffered({ active: true, price: 199 })).toBe(true);
    expect(isPersonaOffered({ active: false, price: 199 })).toBe(false);
    vi.stubEnv("ALLOW_FREE_AI_READINGS", "true");
    expect(isPersonaOffered({ active: true, price: 0 })).toBe(true);
    expect(isPersonaOffered({ active: false, price: 0 })).toBe(false);
  });
});
