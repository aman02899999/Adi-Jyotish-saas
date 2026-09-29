import { describe, expect, it } from "vitest";
import { buildFreeChartPreview } from "@/lib/free-chart";

/**
 * The homepage preview must say the same thing as the member's full chart for the same birth
 * details: a free taste that disagreed with the paid report would undo the trust it is meant to
 * build. The expected values are the ones the member dashboard renders for this profile.
 */
describe("buildFreeChartPreview", () => {
  const preview = buildFreeChartPreview({ birthDate: "1994-06-15", birthTime: "07:45", birthPlace: "Jaipur, India" }, new Date("2026-09-29T00:00:00Z"));

  it("matches the dashboard's Lagna and Moon for the same birth details", () => {
    expect(preview.ascendant).toMatchObject({ name: "Mithuna", english: "Gemini", degree: 28 });
    expect(preview.moon).toMatchObject({ name: "Simha", english: "Leo", nakshatra: "Magha" });
  });

  it("places the Sun in sidereal Vrishabha for mid-June, not tropical Gemini", () => {
    expect(preview.sun).toEqual({ name: "Vrishabha", english: "Taurus" });
  });

  it("names the Mahadasha running on the given date, and when it ends", () => {
    expect(preview.mahadasha?.lord).toMatch(/\(|Rahu|Ketu/);
    expect(preview.mahadasha!.endsOn > "2026-09-29").toBe(true);
    expect(preview.matchedPlace).toContain("Jaipur");
  });
});
