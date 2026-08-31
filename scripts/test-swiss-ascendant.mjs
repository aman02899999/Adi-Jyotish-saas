import {
  calculateHouses,
  dateToJulianDay,
  getAyanamsaExUt,
  setSiderealMode,
} from "@swisseph/node";

import { SiderealMode, HouseSystem } from "@swisseph/core";

setSiderealMode(SiderealMode.Lahiri);

const date = new Date("1990-01-01T12:00:00Z");
const latitude = 28.6139;
const longitude = 77.2090;

const jd = dateToJulianDay(date);
const ayanamsa = getAyanamsaExUt(jd);

const houses = calculateHouses(
  jd,
  latitude,
  longitude,
  HouseSystem.Placidus
);

const ascendantSidereal =
  ((houses.ascendant - ayanamsa) % 360 + 360) % 360;

const mcSidereal =
  ((houses.mc - ayanamsa) % 360 + 360) % 360;

console.log("==========================================");
console.log("ADI JYOTISH GURU — ASCENDANT VALIDATION");
console.log("==========================================");
console.log("Birth:", date.toISOString());
console.log("JD:", jd);
console.log("Ayanamsa:", ayanamsa.toFixed(8), "°");
console.log("Tropical Ascendant:", houses.ascendant.toFixed(8), "°");
console.log("Sidereal Ascendant:", ascendantSidereal.toFixed(8), "°");
console.log("Tropical MC:", houses.mc.toFixed(8), "°");
console.log("Sidereal MC:", mcSidereal.toFixed(8), "°");
console.log("");
console.log("House cusps:");

for (let i = 1; i <= 12; i++) {
  const cusp = houses.cusps[i];
  const sidereal = ((cusp - ayanamsa) % 360 + 360) % 360;

  console.log(
    `${String(i).padStart(2, " ")}:`,
    sidereal.toFixed(8),
    "°"
  );
}
