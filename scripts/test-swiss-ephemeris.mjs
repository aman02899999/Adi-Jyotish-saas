import {
  dateToJulianDay,
  calculatePosition,
  Planet,
  LunarPoint,
  CalculationFlag,
  SiderealMode,
  setSiderealMode,
  getAyanamsaExUt,
  getCelestialBodyName,
  close,
} from "@swisseph/node";

const birthDate = new Date("1990-01-01T12:00:00Z");

const jd = dateToJulianDay(birthDate);

// Use Lahiri ayanamsha — the same Vedic reference we want
// to validate against your current engine.
setSiderealMode(SiderealMode.Lahiri);

const ayanamsa = getAyanamsaExUt(
  jd,
  CalculationFlag.SwissEphemeris
);

const planets = [
  ["Sun", Planet.Sun],
  ["Moon", Planet.Moon],
  ["Mars", Planet.Mars],
  ["Mercury", Planet.Mercury],
  ["Jupiter", Planet.Jupiter],
  ["Venus", Planet.Venus],
  ["Saturn", Planet.Saturn],
  ["Rahu", LunarPoint.MeanNode],
];

function normalize(degrees) {
  return ((degrees % 360) + 360) % 360;
}

console.log("==========================================");
console.log("ADI JYOTISH GURU — SWISS EPHEMERIS TEST");
console.log("==========================================");

console.log("Birth:", birthDate.toISOString());
console.log("Julian Day:", jd);
console.log("Ayanamsa:", ayanamsa.toFixed(8) + "°");
console.log("");

console.log(
  "Planet".padEnd(12),
  "Tropical".padStart(12),
  "Sidereal".padStart(12),
  "Speed".padStart(12),
  "Retrograde"
);

console.log("-".repeat(65));

for (const [name, body] of planets) {
  const tropical = calculatePosition(
    jd,
    body,
    CalculationFlag.SwissEphemeris
  );

  const siderealLongitude = normalize(
    tropical.longitude - ayanamsa
  );

  const retrograde = tropical.longitudeSpeed < 0;

  console.log(
    name.padEnd(12),
    tropical.longitude.toFixed(6).padStart(12),
    siderealLongitude.toFixed(6).padStart(12),
    tropical.longitudeSpeed.toFixed(6).padStart(12),
    retrograde ? "YES" : "NO"
  );
}

// Ketu is exactly opposite Rahu.
const rahu = calculatePosition(
  jd,
  LunarPoint.MeanNode,
  CalculationFlag.SwissEphemeris
);

const rahuSidereal = normalize(
  rahu.longitude - ayanamsa
);

const ketuSidereal = normalize(
  rahuSidereal + 180
);

console.log("");
console.log("Rahu Sidereal:", rahuSidereal.toFixed(6) + "°");
console.log("Ketu Sidereal:", ketuSidereal.toFixed(6) + "°");

console.log("");
console.log("Planet names from Swiss Ephemeris:");

for (const [name, body] of planets) {
  console.log(
    name,
    "=>",
    getCelestialBodyName(body)
  );
}

close();
