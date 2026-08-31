import { describe, expect, it } from "vitest";
import { computeGrahaPositions } from "./astro-engine";
import {
  dateToJulianDay,
  calculatePosition,
  Planet,
  LunarPoint,
  CalculationFlag,
  SiderealMode,
  setSiderealMode,
  getAyanamsaExUt,
} from "@swisseph/node";

function normalize(value: number): number {
  return ((value % 360) + 360) % 360;
}

function angularDifference(a: number, b: number): number {
  const diff = Math.abs(normalize(a - b));
  return Math.min(diff, 360 - diff);
}

const swissBodies = {
  sun: Planet.Sun,
  moon: Planet.Moon,
  mars: Planet.Mars,
  mercury: Planet.Mercury,
  jupiter: Planet.Jupiter,
  venus: Planet.Venus,
  saturn: Planet.Saturn,
  rahu: LunarPoint.MeanNode,
};

describe("Current engine vs Swiss Ephemeris", () => {
  it("compares planetary longitudes across multiple dates", () => {
    const dates = [
      new Date("1950-01-01T00:00:00Z"),
      new Date("1975-06-15T12:00:00Z"),
      new Date("1990-01-01T12:00:00Z"),
      new Date("2000-01-01T00:00:00Z"),
      new Date("2010-07-01T12:00:00Z"),
      new Date("2020-01-01T00:00:00Z"),
      new Date("2026-08-31T00:00:00Z"),
      new Date("2050-01-01T00:00:00Z"),
    ];

    setSiderealMode(SiderealMode.Lahiri);

    const rows: Array<Record<string, unknown>> = [];

    for (const date of dates) {
      const current = computeGrahaPositions(date);
      const jd = dateToJulianDay(date);
      const ayanamsa = getAyanamsaExUt(
        jd,
        CalculationFlag.SwissEphemeris
      );

      for (const position of current) {
        const body =
          swissBodies[position.graha as keyof typeof swissBodies];

        if (body === undefined) continue;

        const result = calculatePosition(
          jd,
          body,
          CalculationFlag.SwissEphemeris
        );

        const swissLongitude = normalize(
          result.longitude - ayanamsa
        );

        const difference = angularDifference(
          position.longitude,
          swissLongitude
        );

        rows.push({
          date: date.toISOString(),
          graha: position.graha,
          current: Number(position.longitude.toFixed(6)),
          swiss: Number(swissLongitude.toFixed(6)),
          differenceArcsec: Number(
            (difference * 3600).toFixed(3)
          ),
        });
      }
    }

    console.table(rows);

    expect(rows.length).toBeGreaterThan(0);

    const maxDifference = Math.max(
      ...rows.map((row) =>
        Number(row.differenceArcsec)
      )
    );

    console.log(
      `\nMaximum longitude difference: ${maxDifference}" arcsec`
    );
  });
});
