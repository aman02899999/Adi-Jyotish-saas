import { describe, expect, it } from "vitest";
import { ayanamsha } from "panchanga";
import {
  ascendantSiderealLongitude, isRetrograde, nakshatraIndexOf, nakshatraPadaOf,
  rashiIndexOf, siderealLongitudeOf, sunriseSunset, tropicalLongitudeOf,
} from "@/lib/astro-engine";

/**
 * Checks the engine against astronomical facts that are true independently of this codebase —
 * published ayanamsa constants, the calendar date of Mesha Sankranti, documented retrograde
 * windows. The existing suites verify the classical *tables* (which bindu goes where); this
 * verifies the *astronomy*, which is the half that could silently drift with an upstream
 * ephemeris change and still look plausible on screen.
 */

describe("Lahiri ayanamsa", () => {
  it("matches the canonical Swiss Ephemeris value at J2000.0", () => {
    // SE_SIDM_LAHIRI is defined as 23.853222° at J2000.0 (2000-01-01 12:00 TT).
    expect(ayanamsha(new Date("2000-01-01T12:00:00Z"))).toBeCloseTo(23.853222, 2);
  });

  it("precesses at roughly 50.3 arcseconds per year", () => {
    // General precession in longitude is ~50.29"/yr, so a century adds ~1.4°.
    const drift = ayanamsha(new Date("2100-01-01T12:00:00Z")) - ayanamsha(new Date("2000-01-01T12:00:00Z"));
    expect(drift).toBeGreaterThan(1.35);
    expect(drift).toBeLessThan(1.45);
  });
});

describe("sidereal zodiac anchoring", () => {
  it("puts Mesha Sankranti in the middle of April", () => {
    // The Sun's entry into sidereal Mesha is the Vedic solar new year, observed ~April 14
    // (Baisakhi / Puthandu / Vishu). Finding it by scan is a direct test that the tropical→
    // sidereal conversion is anchored where Lahiri says it is: a wrong ayanamsa moves this date.
    let crossing: Date | null = null;
    for (let day = 0; day < 40; day++) {
      const before = new Date(Date.UTC(2026, 2, 25 + day, 0, 0, 0));
      const after = new Date(before.getTime() + 86_400_000);
      if (rashiIndexOf(siderealLongitudeOf(before, "sun")) === 11 && rashiIndexOf(siderealLongitudeOf(after, "sun")) === 0) {
        crossing = after;
        break;
      }
    }
    expect(crossing, "Sun never entered Mesha in the scanned window").not.toBeNull();
    expect(crossing!.getUTCMonth()).toBe(3); // April
    expect(crossing!.getUTCDate()).toBeGreaterThanOrEqual(13);
    expect(crossing!.getUTCDate()).toBeLessThanOrEqual(15);
  });

  it("keeps sidereal and tropical longitudes exactly one ayanamsa apart", () => {
    const when = new Date("2026-06-15T00:00:00Z");
    const gap = tropicalLongitudeOf(when, "sun") - siderealLongitudeOf(when, "sun");
    expect(gap).toBeCloseTo(ayanamsha(when, { nutation: true }), 1);
  });
});

describe("ascendant", () => {
  it("equals the Sun's longitude at the moment of sunrise", () => {
    // At sunrise the Sun sits on the eastern horizon, which is what the Lagna *is* — so the two
    // must agree. This is the check that catches a sign error in the RAMC formula, which would
    // otherwise put every chart's Lagna 180° out and still look like a valid chart.
    const latitude = 26.92;
    const longitude = 75.82; // Jaipur
    for (const day of ["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]) {
      const { sunrise } = sunriseSunset(new Date(`${day}T00:00:00Z`), latitude, longitude);
      expect(sunrise, day).not.toBeNull();
      const ascendant = ascendantSiderealLongitude(sunrise!, latitude, longitude);
      const sun = siderealLongitudeOf(sunrise!, "sun");
      const separation = Math.abs(((ascendant - sun + 540) % 360) - 180);
      expect(separation, `${day}: Lagna ${ascendant.toFixed(1)}° vs Sun ${sun.toFixed(1)}°`).toBeLessThan(3);
    }
  });

  it("advances through all twelve rashis over a single day", () => {
    const seen = new Set<number>();
    for (let hour = 0; hour < 24; hour++) {
      const when = new Date(Date.UTC(2026, 5, 15, hour));
      seen.add(rashiIndexOf(ascendantSiderealLongitude(when, 26.92, 75.82)));
    }
    expect(seen.size).toBe(12);
  });
});

describe("retrograde detection", () => {
  it("finds Mercury retrograde during a documented 2026 window and direct outside it", () => {
    // Mercury was retrograde 26 Feb - 20 Mar 2026; mid-window and well outside it are both checked
    // so a function that simply always returned true would fail.
    expect(isRetrograde(new Date("2026-03-08T00:00:00Z"), "mercury")).toBe(true);
    expect(isRetrograde(new Date("2026-01-15T00:00:00Z"), "mercury")).toBe(false);
  });

  it("never reports the luminaries retrograde and always reports the nodes retrograde", () => {
    for (const day of ["2026-01-01", "2026-05-05", "2026-09-09"]) {
      const when = new Date(`${day}T00:00:00Z`);
      expect(isRetrograde(when, "sun"), day).toBe(false);
      expect(isRetrograde(when, "moon"), day).toBe(false);
      expect(isRetrograde(when, "rahu"), day).toBe(true);
      expect(isRetrograde(when, "ketu"), day).toBe(true);
    }
  });
});

describe("nakshatra and node geometry", () => {
  it("keeps Ketu exactly opposite Rahu", () => {
    for (const day of ["1985-03-01", "2000-01-01", "2026-08-26"]) {
      const when = new Date(`${day}T00:00:00Z`);
      const separation = (siderealLongitudeOf(when, "ketu") - siderealLongitudeOf(when, "rahu") + 360) % 360;
      expect(separation, day).toBeCloseTo(180, 6);
    }
  });

  it("divides the zodiac into 27 nakshatras of four padas each", () => {
    expect(nakshatraIndexOf(0)).toBe(0);
    expect(nakshatraIndexOf(359.99)).toBe(26);
    // Ashwini spans 0°-13°20', so its four padas break at 3°20', 6°40' and 10°.
    expect(nakshatraPadaOf(0)).toBe(1);
    expect(nakshatraPadaOf(3.4)).toBe(2);
    expect(nakshatraPadaOf(6.7)).toBe(3);
    expect(nakshatraPadaOf(10.1)).toBe(4);
  });

  it("moves the Moon through roughly one nakshatra per day", () => {
    // The Moon covers 360° in ~27.3 days, i.e. about one 13°20' nakshatra daily — a cheap guard
    // that the Moon's longitude is a real ephemeris value and not a stale or constant one.
    const start = new Date("2026-08-01T00:00:00Z");
    const daily = siderealLongitudeOf(new Date(start.getTime() + 86_400_000), "moon") - siderealLongitudeOf(start, "moon");
    const normalized = ((daily % 360) + 360) % 360;
    expect(normalized).toBeGreaterThan(11);
    expect(normalized).toBeLessThan(16);
  });
});
