import type { GrahaKey } from "./grahas";

export type AstronomyPlanetPosition = {
  graha: GrahaKey;
  longitude: number;
  speedLongitude: number;
  isRetrograde: boolean;
};

export type AstronomyProvider = {
  getPlanetPositions(date: Date): AstronomyPlanetPosition[];

  getAscendant(
    date: Date,
    latitude: number,
    longitude: number
  ): number;

  getAyanamsa(date: Date): number;
};
