import "server-only";

import * as Astronomy from "astronomy-engine";
import { ayanamsha, normalize360, siderealLongitude as packageSiderealLongitude } from "panchanga";

/**
 * Real sidereal (Vedic) astronomical engine — no AI. Planetary positions come from
 * `astronomy-engine` (a pure-JS ephemeris accurate to arcsecond level), converted from
 * tropical to sidereal with the Lahiri (Chitrapaksha) ayanamsa via the `panchanga`
 * package, which anchors to the canonical Swiss Ephemeris SE_SIDM_LAHIRI value
 * (23.853222° at J2000.0) and applies the IAU 1976 / Meeus general-precession-in-longitude
 * series. Sanity-checked against the well-documented Mesha Sankranti date (~April 14).
 */

export const RASHIS = [
  { key: "mesha", name: "Mesha", english: "Aries" },
  { key: "vrishabha", name: "Vrishabha", english: "Taurus" },
  { key: "mithuna", name: "Mithuna", english: "Gemini" },
  { key: "karka", name: "Karka", english: "Cancer" },
  { key: "simha", name: "Simha", english: "Leo" },
  { key: "kanya", name: "Kanya", english: "Virgo" },
  { key: "tula", name: "Tula", english: "Libra" },
  { key: "vrishchika", name: "Vrishchika", english: "Scorpio" },
  { key: "dhanu", name: "Dhanu", english: "Sagittarius" },
  { key: "makara", name: "Makara", english: "Capricorn" },
  { key: "kumbha", name: "Kumbha", english: "Aquarius" },
  { key: "meena", name: "Meena", english: "Pisces" },
] as const;

export const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
] as const;

import { GRAHAS, type GrahaKey } from "./astronomy/grahas";

export { GRAHAS, type GrahaKey };

export const GRAHA_LABELS: Record<GrahaKey, string> = {
  sun: "Surya (Sun)", moon: "Chandra (Moon)", mars: "Mangal (Mars)", mercury: "Budh (Mercury)",
  jupiter: "Guru (Jupiter)", venus: "Shukra (Venus)", saturn: "Shani (Saturn)", rahu: "Rahu", ketu: "Ketu",
};

/** Two-letter symbols for the compact house cells of a chart diagram. */
export const GRAHA_SHORT: Record<GrahaKey, string> = {
  sun: "Su", moon: "Mo", mars: "Ma", mercury: "Me", jupiter: "Ju", venus: "Ve", saturn: "Sa", rahu: "Ra", ketu: "Ke",
};

const BODY_BY_GRAHA: Partial<Record<GrahaKey, Astronomy.Body>> = {
  sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mars: Astronomy.Body.Mars, mercury: Astronomy.Body.Mercury,
  jupiter: Astronomy.Body.Jupiter, venus: Astronomy.Body.Venus, saturn: Astronomy.Body.Saturn,
};

/**
 * Mean ascending lunar node (Rahu) tropical longitude — Meeus, "Astronomical Algorithms"
 * ch. 22, the same Ω polynomial used as the fundamental nutation argument.
 */
function meanLunarNodeTropicalLongitude(date: Date): number {
  const time = Astronomy.MakeTime(date);
  const t = time.tt / 36525;
  const omega = 125.04452 - 1934.136261 * t + 0.0020708 * t * t + (t * t * t) / 450000;
  return normalize360(omega);
}

/**
 * Tropical (Western) ecliptic longitude of date — used only by the pop-astrology daily
 * horoscope tool, which is a Western/tropical-sign genre by convention. Everything else
 * (Kundli, matching, Panchang) uses the sidereal longitudes below instead.
 */
export function tropicalLongitudeOf(date: Date, graha: Extract<GrahaKey, "sun" | "moon">): number {
  if (graha === "sun") return normalize360(Astronomy.SunPosition(date).elon);
  return normalize360(Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Moon, date, true)).elon);
}

export function siderealLongitudeOf(date: Date, graha: GrahaKey): number {
  if (graha === "rahu") return normalize360(meanLunarNodeTropicalLongitude(date) - ayanamsha(date, { nutation: true }));
  if (graha === "ketu") return normalize360(siderealLongitudeOf(date, "rahu") + 180);
  const body = BODY_BY_GRAHA[graha]!;
  return packageSiderealLongitude(date, body);
}

export function rashiIndexOf(longitude: number) {
  return Math.floor(normalize360(longitude) / 30);
}

export function degreeWithinRashi(longitude: number) {
  return normalize360(longitude) % 30;
}

const NAKSHATRA_SPAN = 360 / 27;

export function nakshatraIndexOf(longitude: number) {
  return Math.floor(normalize360(longitude) / NAKSHATRA_SPAN);
}

export function nakshatraPadaOf(longitude: number) {
  const within = normalize360(longitude) % NAKSHATRA_SPAN;
  return Math.floor(within / (NAKSHATRA_SPAN / 4)) + 1;
}

export function formatDegree(longitude: number) {
  const within = degreeWithinRashi(longitude);
  const degrees = Math.floor(within);
  const minutes = Math.floor((within - degrees) * 60);
  return `${degrees}°${String(minutes).padStart(2, "0")}'`;
}

/**
 * Sidereal Ascendant (Lagna) — standard RAMC + obliquity formula (Meeus ch. 13).
 * Sanity check: at the exact moment of sunrise, the Ascendant equals the Sun's
 * ecliptic longitude (the Sun is on the horizon by definition), which holds to
 * within a fraction of a degree since the Sun's ecliptic latitude is ~0.
 */
export function ascendantSiderealLongitude(date: Date, lat: number, lon: number) {
  const time = Astronomy.MakeTime(date);
  const gstHours = Astronomy.SiderealTime(time);
  const ramcDeg = normalize360(gstHours * 15 + lon);
  const ramcRad = ramcDeg * Astronomy.DEG2RAD;
  const obliquityRad = Astronomy.e_tilt(time).tobl * Astronomy.DEG2RAD;
  const latRad = lat * Astronomy.DEG2RAD;

  // Signs verified empirically: the un-negated y/x gives the Descendant (off by ~180°),
  // confirmed by comparing against the Sun's own ecliptic longitude at the exact moment
  // of sunrise (the Sun IS the ecliptic/horizon crossing point at that instant).
  const y = Math.cos(ramcRad);
  const x = -(Math.sin(obliquityRad) * Math.tan(latRad) + Math.cos(obliquityRad) * Math.sin(ramcRad));
  const ascendantTropical = normalize360(Math.atan2(y, x) * Astronomy.RAD2DEG);

  return normalize360(ascendantTropical - ayanamsha(date, { nutation: true }));
}

export function sunriseSunset(date: Date, lat: number, lon: number) {
  const observer = new Astronomy.Observer(lat, lon, 0);
  const sunrise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, 1, date, 1);
  const sunset = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, date, 1);
  return { sunrise: sunrise?.date ?? null, sunset: sunset?.date ?? null };
}

const RETROGRADE_SAMPLE_DAYS = 1;

/**
 * Whether a graha appears retrograde (apparent backward motion through the zodiac) at the given
 * moment — interpretively significant in Jyotish, and previously omitted entirely from this
 * engine. The Sun and Moon never appear retrograde from Earth by definition (geocentric, so this
 * is a real astronomical fact, not a simplification); Rahu/Ketu are computed here as the mean
 * lunar node, which regresses through the zodiac continuously, so they're always retrograde.
 * Everything else is measured directly: sample the longitude a day either side of the date and
 * check whether it moved backward (handling the 360°/0° wrap).
 */
export function isRetrograde(date: Date, graha: GrahaKey): boolean {
  if (graha === "sun" || graha === "moon") return false;
  if (graha === "rahu" || graha === "ketu") return true;
  const before = siderealLongitudeOf(new Date(date.getTime() - RETROGRADE_SAMPLE_DAYS * 86_400_000), graha);
  const after = siderealLongitudeOf(new Date(date.getTime() + RETROGRADE_SAMPLE_DAYS * 86_400_000), graha);
  const delta = ((after - before + 180) % 360 + 360) % 360 - 180;
  return delta < 0;
}

export type GrahaPosition = {
  graha: GrahaKey;
  longitude: number;
  rashiIndex: number;
  degreeInRashi: number;
  nakshatraIndex: number;
  pada: number;
  isRetrograde: boolean;
};

export function computeGrahaPositions(date: Date): GrahaPosition[] {
  return GRAHAS.map((graha) => {
    const longitude = siderealLongitudeOf(date, graha);
    return {
      graha,
      longitude,
      rashiIndex: rashiIndexOf(longitude),
      degreeInRashi: degreeWithinRashi(longitude),
      nakshatraIndex: nakshatraIndexOf(longitude),
      pada: nakshatraPadaOf(longitude),
      isRetrograde: isRetrograde(date, graha),
    };
  });
}
