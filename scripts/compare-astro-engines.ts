import { computeGrahaPositions } from "../src/lib/astro-engine";
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

const birthDate = new Date("1990-01-01T12:00:00Z");

const jd = dateToJulianDay(birthDate);

setSiderealMode(SiderealMode.Lahiri);

const ayanamsa = getAyanamsaExUt(
  jd,
  CalculationFlag.SwissEphemeris
);

function normalize(value: number) {
  return ((value % 360) + 360) % 360;
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

const current = computeGrahaPositions(birthDate);

console.log("\n==============================================");
console.log("ADI JYOTISH GURU — ENGINE COMPARISON");
console.log("==============================================\n");

console.log("Birth:", birthDate.toISOString());
console.log("Swiss Lahiri Ayanamsa:", ayanamsa.toFixed(8));
console.log("");

console.log(
  "Graha".padEnd(12),
  "Current".padStart(14),
  "Swiss".padStart(14),
  "Difference".padStart(14)
);

console.log("-".repeat(58));

for (const position of current) {
  const body = swissBodies[position.graha as keyof typeof swissBodies];

  if (body === undefined) {
    continue;
  }

  const result = calculatePosition(
    jd,
    body,
    CalculationFlag.SwissEphemeris
  );

  const swissSidereal = normalize(
    result.longitude - ayanamsa
  );

  const difference = Math.abs(
    normalize(position.longitude - swissSidereal + 180) - 180
  );

  console.log(
    position.graha.padEnd(12),
    position.longitude.toFixed(6).padStart(14),
    swissSidereal.toFixed(6).padStart(14),
    difference.toFixed(6).padStart(14)
  );
}

console.log("\nCurrent engine positions:");
console.table(
  current.map((p) => ({
    graha: p.graha,
    longitude: Number(p.longitude.toFixed(6)),
    rashi: p.rashiIndex,
    nakshatra: p.nakshatraIndex,
    pada: p.pada,
    retrograde: p.isRetrograde,
  }))
);
