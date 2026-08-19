import { describe, expect, it } from "vitest";
import { detectKaalSarpDosha, detectMangalDosha, detectSadeSati } from "@/lib/dosha-engine";

describe("detectMangalDosha", () => {
  it("flags Mangal Dosha when Mars is in a dosha house from Lagna", () => {
    // Mars in the same rashi as the Ascendant = house 1 from Lagna.
    const result = detectMangalDosha({ marsRashiIndex: 2, ascendantRashiIndex: 2, moonRashiIndex: 5 });
    expect(result.presentFromLagna).toBe(true);
    expect(result.houseFromLagna).toBe(1);
    expect(result.active).toBe(true);
  });

  it("does not flag Mangal Dosha when Mars is outside the dosha houses from both Lagna and Moon", () => {
    // Mars 3 signs ahead of both Lagna and Moon = house 4... pick a case that lands outside {1,2,4,7,8,12}.
    const result = detectMangalDosha({ marsRashiIndex: 2, ascendantRashiIndex: 0, moonRashiIndex: 0 }); // house 3 from both
    expect(result.present).toBe(false);
    expect(result.active).toBe(false);
  });

  it("cancels Mangal Dosha when Mars sits in its own sign", () => {
    // Mars in Mesha (0), Ascendant in Mesha (0) too => house 1, own sign.
    const result = detectMangalDosha({ marsRashiIndex: 0, ascendantRashiIndex: 0, moonRashiIndex: 5 });
    expect(result.present).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.active).toBe(false);
    expect(result.cancellationReason).toContain("own sign");
  });

  it("cancels Mangal Dosha when Mars is exalted (Makara)", () => {
    const result = detectMangalDosha({ marsRashiIndex: 9, ascendantRashiIndex: 9, moonRashiIndex: 5 });
    expect(result.cancelled).toBe(true);
    expect(result.cancellationReason).toContain("exalted");
  });
});

describe("detectKaalSarpDosha", () => {
  it("flags Kaal Sarp Dosha when all seven planets fall between Rahu and Ketu", () => {
    const result = detectKaalSarpDosha({
      planetLongitudes: [10, 30, 50, 70, 90, 110, 130],
      rahuLongitude: 0,
      rahuRashiIndex: 0,
      ascendantRashiIndex: 0,
    });
    expect(result.present).toBe(true);
    expect(result.name).toBe("Anant Kaal Sarp Dosha");
  });

  it("does not flag Kaal Sarp Dosha when a planet falls outside the Rahu-Ketu arc", () => {
    const result = detectKaalSarpDosha({
      planetLongitudes: [10, 30, 50, 70, 90, 110, 200], // 200 is on the other side of Ketu (180)
      rahuLongitude: 0,
      rahuRashiIndex: 0,
      ascendantRashiIndex: 0,
    });
    expect(result.present).toBe(false);
    expect(result.name).toBeNull();
  });

  it("names the dosha type from Rahu's house position from Lagna", () => {
    // Rahu 6 signs ahead of Lagna = house 7 from Lagna = Takshak.
    const result = detectKaalSarpDosha({
      planetLongitudes: [190, 210, 230, 250, 270, 290, 310],
      rahuLongitude: 180,
      rahuRashiIndex: 6,
      ascendantRashiIndex: 0,
    });
    expect(result.present).toBe(true);
    expect(result.name).toBe("Takshak Kaal Sarp Dosha");
  });
});

describe("detectSadeSati", () => {
  it("flags the peak phase when transiting Saturn matches the natal Moon's rashi", () => {
    const result = detectSadeSati({ moonRashiIndex: 4, saturnRashiIndex: 4 });
    expect(result.active).toBe(true);
    expect(result.phase).toBe("peak");
  });

  it("flags the rising phase when Saturn is one sign behind the natal Moon", () => {
    const result = detectSadeSati({ moonRashiIndex: 4, saturnRashiIndex: 3 });
    expect(result.phase).toBe("rising");
  });

  it("flags the setting phase when Saturn is one sign ahead of the natal Moon", () => {
    const result = detectSadeSati({ moonRashiIndex: 4, saturnRashiIndex: 5 });
    expect(result.phase).toBe("setting");
  });

  it("is not active when Saturn is elsewhere", () => {
    const result = detectSadeSati({ moonRashiIndex: 4, saturnRashiIndex: 9 });
    expect(result.active).toBe(false);
    expect(result.phase).toBeNull();
  });
});
