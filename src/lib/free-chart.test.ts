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
    expect(preview.moon).toMatchObject({ signs: [{ name: "Simha", english: "Leo" }], nakshatras: ["Magha"] });
  });

  it("places the Sun in sidereal Vrishabha for mid-June, not tropical Gemini", () => {
    expect(preview.sun).toEqual({ signs: [{ name: "Vrishabha", english: "Taurus" }] });
  });

  it("names the Mahadasha running on the given date, and when it ends", () => {
    expect(preview.mahadasha?.lord).toMatch(/\(|Rahu|Ketu/);
    expect(preview.mahadasha?.endsOn! > "2026-09-29").toBe(true);
    expect(preview.matchedPlace).toContain("Jaipur");
  });

  describe("without a birth time", () => {
    const asOf = new Date("2026-09-29T00:00:00Z");
    const unknown = (birthDate: string) => buildFreeChartPreview({ birthDate, birthTime: null, birthPlace: "Jaipur, India" }, asOf);

    it("offers every nakshatra and sign the Moon passed through that day, not a noon guess", () => {
      // On 15 June 1994 the Moon moved from Magha into Purva Phalguni; either could be the member's.
      const day = unknown("1994-06-15");
      expect(day.moon.nakshatras).toEqual(["Magha", "Purva Phalguni"]);
      expect(day.moon.signs.map((entry) => entry.name)).toEqual(["Simha"]);
      expect(day.moon.pada).toBeNull();
      // The Sun changed sign that day too.
      expect(day.sun.signs.map((entry) => entry.name)).toEqual(["Vrishabha", "Mithuna"]);
      expect(unknown("1994-06-14").moon.signs.map((entry) => entry.name)).toEqual(["Karka", "Simha"]);
    });

    it("states no Lagna, and a Mahadasha only when every time that day agrees, never with an end date", () => {
      const day = unknown("1994-06-15");
      expect(day.timeKnown).toBe(false);
      expect(day.ascendant).toBeNull();
      expect(day.mahadasha).toBeNull();
      expect(unknown("1994-06-18").mahadasha).toEqual({ lord: "Guru (Jupiter)", endsOn: null });
    });
  });
});
