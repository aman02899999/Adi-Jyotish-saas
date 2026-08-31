import type { AstronomyProvider } from "./types";
import { swissEphemerisProvider } from "./swiss-ephemeris";

export type AstronomyProviderName = "swiss";

export function getAstronomyProvider(
  name: AstronomyProviderName = "swiss",
): AstronomyProvider {
  switch (name) {
    case "swiss":
      return swissEphemerisProvider;
    default:
      throw new Error(`Unsupported astronomy provider: ${name}`);
  }
}
