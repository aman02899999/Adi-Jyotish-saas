import {
  calculateHouses,
  calculatePosition,
  dateToJulianDay,
  getAyanamsaExUt,
  setSiderealMode,
} from "@swisseph/node";

import {
  CalculationFlag,
  HouseSystem,
  LunarPoint,
  Planet,
  SiderealMode,
} from "@swisseph/core";

import type {
  AstronomyPlanetPosition,
  AstronomyProvider,
} from "./types";

import type { GrahaKey } from "./grahas";

type SwissPlanetGraha = Exclude<GrahaKey, "ketu">;

// ADI JYOTISH GURU STANDARD:
// Swiss Ephemeris must explicitly use Lahiri / Chitrapaksha.
// Without this call Swiss Ephemeris defaults to Fagan/Bradley.
setSiderealMode(SiderealMode.Lahiri);


const PLANETS: Record<SwissPlanetGraha, Planet | LunarPoint> = {
  sun: Planet.Sun,
  moon: Planet.Moon,
  mars: Planet.Mars,
  mercury: Planet.Mercury,
  jupiter: Planet.Jupiter,
  venus: Planet.Venus,
  saturn: Planet.Saturn,
  rahu: LunarPoint.MeanNode,
};

function normalize360(value: number): number {
  return ((value % 360) + 360) % 360;
}

function isRetrograde(
  graha: GrahaKey,
  longitudeSpeed: number
): boolean {
  if (graha === "sun" || graha === "moon") {
    return false;
  }

  if (graha === "rahu" || graha === "ketu") {
    return true;
  }

  return longitudeSpeed < 0;
}

function getLahiriAyanamsa(jd: number): number {
  return getAyanamsaExUt(
    jd,
    CalculationFlag.SwissEphemeris
  );
}

const PLANET_FLAGS =
  CalculationFlag.SwissEphemeris |
  CalculationFlag.Speed;

export const swissEphemerisProvider: AstronomyProvider = {
  getPlanetPositions(date: Date): AstronomyPlanetPosition[] {
    const jd = dateToJulianDay(date);
    const ayanamsa = getLahiriAyanamsa(jd);

    const positions: AstronomyPlanetPosition[] = [];

    const grahas = [
      "sun",
      "moon",
      "mars",
      "mercury",
      "jupiter",
      "venus",
      "saturn",
      "rahu",
    ] as const;

    for (const graha of grahas) {
      const result = calculatePosition(
        jd,
        PLANETS[graha],
        PLANET_FLAGS
      );

      const longitude = normalize360(
        result.longitude - ayanamsa
      );

      const longitudeSpeed =
        result.longitudeSpeed ?? 0;

      positions.push({
        graha,
        longitude,
        speedLongitude: longitudeSpeed,
        isRetrograde: isRetrograde(
          graha,
          longitudeSpeed
        ),
      });
    }

    const rahu = positions.find(
      (position) => position.graha === "rahu"
    );

    if (!rahu) {
      throw new Error(
        "Swiss Ephemeris failed to calculate Rahu."
      );
    }

    positions.push({
      graha: "ketu",
      longitude: normalize360(
        rahu.longitude + 180
      ),
      speedLongitude: rahu.speedLongitude,
      isRetrograde: true,
    });

    return positions;
  },

  getAscendant(
    date: Date,
    latitude: number,
    longitude: number
  ): number {
    const jd = dateToJulianDay(date);

    const houses = calculateHouses(
      jd,
      latitude,
      longitude,
      HouseSystem.Placidus
    );

    const ayanamsa = getLahiriAyanamsa(jd);

    return normalize360(
      houses.ascendant - ayanamsa
    );
  },

  getAyanamsa(date: Date): number {
    const jd = dateToJulianDay(date);

    return getLahiriAyanamsa(jd);
  },
};
