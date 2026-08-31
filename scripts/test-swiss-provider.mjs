import { swissEphemerisProvider } from "../src/lib/astronomy/swiss-ephemeris.ts";

const birthDate = new Date("1990-01-01T12:00:00Z");
const latitude = 28.6139;
const longitude = 77.2090;

console.log("==========================================");
console.log("ADI JYOTISH GURU — SWISS PROVIDER");
console.log("==========================================");

console.log("Birth:", birthDate.toISOString());

console.log(
  "Ayanamsa:",
  swissEphemerisProvider
    .getAyanamsa(birthDate)
    .toFixed(8),
  "°"
);

const planets =
  swissEphemerisProvider.getPlanetPositions(
    birthDate
  );

console.table(
  planets.map((p) => ({
    graha: p.graha,
    longitude: Number(p.longitude.toFixed(8)),
    speed: Number(p.speedLongitude.toFixed(8)),
    retrograde: p.isRetrograde,
  }))
);

const ascendant =
  swissEphemerisProvider.getAscendant(
    birthDate,
    latitude,
    longitude
  );

console.log(
  "Sidereal Ascendant:",
  ascendant.toFixed(8),
  "°"
);
