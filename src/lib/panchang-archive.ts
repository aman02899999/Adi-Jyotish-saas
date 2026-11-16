import { dailyPanchanga, lunarEclipses, solarEclipses, type DailyPanchanga, type GeoLocation } from "panchanga";

/**
 * The Panchang for any day in a fixed span of years, for a short list of Indian cities.
 *
 * Nothing here is stored or imported: every value is computed on request from the positions of the
 * Sun and Moon, which takes a few milliseconds per day. A Panchang depends on where you stand
 * (sunrise decides which tithi "belongs" to the day), so a single saved table could only ever be
 * right for one city. Computing also means no almanac publisher's tables are copied.
 *
 * The span starts at 1950 on purpose. India ran on more than one clock time before independence
 * (Bombay and Calcutta kept their own), so a clock time printed for an earlier date would need a
 * per-city time-zone history this site does not have.
 */
export const PANCHANG_MIN_YEAR = 1950;
export const PANCHANG_MAX_YEAR = 2050;
export const PANCHANG_MIN_DATE = `${PANCHANG_MIN_YEAR}-01-01`;
export const PANCHANG_MAX_DATE = `${PANCHANG_MAX_YEAR}-12-31`;

export type PanchangCity = { slug: string; name: string; nameHi: string; state: string; latitude: number; longitude: number; timeZone: string };

/**
 * Coordinates are the ones in the bundled place data (`src/lib/geo-data/cities.json`), which a test
 * holds this list to. New Delhi keeps the point the daily Panchang has always used.
 */
export const PANCHANG_CITIES: readonly PanchangCity[] = [
  { slug: "new-delhi", name: "New Delhi", nameHi: "Nayi Dilli", state: "Delhi", latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" },
  { slug: "mumbai", name: "Mumbai", nameHi: "Mumbai", state: "Maharashtra", latitude: 19.07283, longitude: 72.88261, timeZone: "Asia/Kolkata" },
  { slug: "kolkata", name: "Kolkata", nameHi: "Kolkata", state: "West Bengal", latitude: 22.56263, longitude: 88.36304, timeZone: "Asia/Kolkata" },
  { slug: "chennai", name: "Chennai", nameHi: "Chennai", state: "Tamil Nadu", latitude: 13.08784, longitude: 80.27847, timeZone: "Asia/Kolkata" },
  { slug: "bengaluru", name: "Bengaluru", nameHi: "Bengaluru", state: "Karnataka", latitude: 12.97194, longitude: 77.59369, timeZone: "Asia/Kolkata" },
  { slug: "hyderabad", name: "Hyderabad", nameHi: "Hyderabad", state: "Telangana", latitude: 17.38405, longitude: 78.45636, timeZone: "Asia/Kolkata" },
  { slug: "ahmedabad", name: "Ahmedabad", nameHi: "Ahmedabad", state: "Gujarat", latitude: 23.02579, longitude: 72.58727, timeZone: "Asia/Kolkata" },
  { slug: "pune", name: "Pune", nameHi: "Pune", state: "Maharashtra", latitude: 18.51957, longitude: 73.85535, timeZone: "Asia/Kolkata" },
  { slug: "jaipur", name: "Jaipur", nameHi: "Jaipur", state: "Rajasthan", latitude: 26.91962, longitude: 75.78781, timeZone: "Asia/Kolkata" },
  { slug: "lucknow", name: "Lucknow", nameHi: "Lucknow", state: "Uttar Pradesh", latitude: 26.83928, longitude: 80.92313, timeZone: "Asia/Kolkata" },
  { slug: "varanasi", name: "Varanasi", nameHi: "Varanasi (Kashi)", state: "Uttar Pradesh", latitude: 25.31668, longitude: 83.01041, timeZone: "Asia/Kolkata" },
  { slug: "prayagraj", name: "Prayagraj", nameHi: "Prayagraj", state: "Uttar Pradesh", latitude: 25.44478, longitude: 81.84322, timeZone: "Asia/Kolkata" },
  { slug: "mathura", name: "Mathura", nameHi: "Mathura", state: "Uttar Pradesh", latitude: 27.5035, longitude: 77.67215, timeZone: "Asia/Kolkata" },
  { slug: "haridwar", name: "Haridwar", nameHi: "Haridwar", state: "Uttarakhand", latitude: 29.94791, longitude: 78.16025, timeZone: "Asia/Kolkata" },
  { slug: "ujjain", name: "Ujjain", nameHi: "Ujjain", state: "Madhya Pradesh", latitude: 23.18239, longitude: 75.77643, timeZone: "Asia/Kolkata" },
  { slug: "bhopal", name: "Bhopal", nameHi: "Bhopal", state: "Madhya Pradesh", latitude: 23.25469, longitude: 77.40289, timeZone: "Asia/Kolkata" },
  { slug: "indore", name: "Indore", nameHi: "Indore", state: "Madhya Pradesh", latitude: 22.71792, longitude: 75.8333, timeZone: "Asia/Kolkata" },
  { slug: "patna", name: "Patna", nameHi: "Patna", state: "Bihar", latitude: 25.59408, longitude: 85.13563, timeZone: "Asia/Kolkata" },
  { slug: "chandigarh", name: "Chandigarh", nameHi: "Chandigarh", state: "Chandigarh", latitude: 30.73629, longitude: 76.7884, timeZone: "Asia/Kolkata" },
  { slug: "amritsar", name: "Amritsar", nameHi: "Amritsar", state: "Punjab", latitude: 31.62234, longitude: 74.87534, timeZone: "Asia/Kolkata" },
  { slug: "nagpur", name: "Nagpur", nameHi: "Nagpur", state: "Maharashtra", latitude: 21.14631, longitude: 79.08491, timeZone: "Asia/Kolkata" },
  { slug: "surat", name: "Surat", nameHi: "Surat", state: "Gujarat", latitude: 21.19594, longitude: 72.83023, timeZone: "Asia/Kolkata" },
  { slug: "guwahati", name: "Guwahati", nameHi: "Guwahati", state: "Assam", latitude: 26.1844, longitude: 91.7458, timeZone: "Asia/Kolkata" },
  { slug: "ranchi", name: "Ranchi", nameHi: "Ranchi", state: "Jharkhand", latitude: 23.34316, longitude: 85.3094, timeZone: "Asia/Kolkata" },
  { slug: "puri", name: "Puri", nameHi: "Puri", state: "Odisha", latitude: 19.79825, longitude: 85.82494, timeZone: "Asia/Kolkata" },
  { slug: "tirupati", name: "Tirupati", nameHi: "Tirupati", state: "Andhra Pradesh", latitude: 13.63551, longitude: 79.41989, timeZone: "Asia/Kolkata" },
  { slug: "madurai", name: "Madurai", nameHi: "Madurai", state: "Tamil Nadu", latitude: 9.919, longitude: 78.11953, timeZone: "Asia/Kolkata" },
  { slug: "thiruvananthapuram", name: "Thiruvananthapuram", nameHi: "Thiruvananthapuram", state: "Kerala", latitude: 8.4855, longitude: 76.94924, timeZone: "Asia/Kolkata" },
];

export const DEFAULT_PANCHANG_CITY = PANCHANG_CITIES[0];

export function getPanchangCity(slug: string): PanchangCity | null {
  return PANCHANG_CITIES.find((city) => city.slug === slug) ?? null;
}

function locationOf(city: PanchangCity): GeoLocation {
  return { latitude: city.latitude, longitude: city.longitude, timeZone: city.timeZone };
}

/** A real calendar date inside the supported span, written YYYY-MM-DD; anything else is null. */
export function parsePanchangDate(text: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < PANCHANG_MIN_YEAR || year > PANCHANG_MAX_YEAR) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date rolls 31 February over into March; a round trip catches that.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return text;
}

/** A month inside the supported span, written YYYY-MM; anything else is null. */
export function parsePanchangMonth(text: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month] = [Number(match[1]), Number(match[2])];
  if (year < PANCHANG_MIN_YEAR || year > PANCHANG_MAX_YEAR || month < 1 || month > 12) return null;
  return { year, month };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The day before or after, or null when that would leave the supported span. */
export function shiftPanchangDate(date: string, days: number): string | null {
  const shifted = new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000);
  return parsePanchangDate(shifted.toISOString().slice(0, 10));
}

/** The month before or after, or null when that would leave the supported span. */
export function shiftPanchangMonth(year: number, month: number, by: number): string | null {
  const shifted = new Date(Date.UTC(year, month - 1 + by, 1));
  const key = monthKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1);
  return parsePanchangMonth(key) ? key : null;
}

/** An eclipse falling on a civil day, with whether it can be seen from the city. */
export type DayEclipse = { body: "sun" | "moon"; kind: string; peak: string; visible: boolean };

export type PanchangDay = DailyPanchanga & { eclipses: DayEclipse[] };

function civilDateOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function eclipsesOn(date: string, city: PanchangCity): DayEclipse[] {
  const location = locationOf(city);
  const year = Number(date.slice(0, 4));
  const found: DayEclipse[] = [];
  // An eclipse just after midnight on 1 January belongs to the previous UTC year, so look there too.
  for (const candidate of [year - 1, year, year + 1]) {
    if (Math.abs(candidate - year) === 1 && !/-(01-01|12-31)$/.test(date)) continue;
    for (const eclipse of solarEclipses(candidate, location)) {
      const peak = eclipse.local?.peak ?? eclipse.peak;
      if (civilDateOf(peak, city.timeZone) === date) found.push({ body: "sun", kind: eclipse.kind, peak, visible: eclipse.visible === true });
    }
    for (const eclipse of lunarEclipses(candidate, location)) {
      if (civilDateOf(eclipse.peak, city.timeZone) === date) found.push({ body: "moon", kind: eclipse.kind, peak: eclipse.peak, visible: eclipse.visible === true });
    }
  }
  return found;
}

/**
 * Noon UTC is 5:30 pm in India, the same civil day, so the engine resolves the day we asked for.
 * The five limbs are the ones prevailing at that city's sunrise, the convention printed almanacs use.
 */
function computeDay(date: string, city: PanchangCity): DailyPanchanga {
  return dailyPanchanga(new Date(`${date}T12:00:00Z`), locationOf(city));
}

/** `eclipses: false` skips the eclipse search, which costs far more than the five limbs do. */
export function getPanchangForDate(date: string, city: PanchangCity = DEFAULT_PANCHANG_CITY, options: { eclipses?: boolean } = {}): PanchangDay {
  if (!parsePanchangDate(date)) throw new RangeError(`Panchang is available from ${PANCHANG_MIN_DATE} to ${PANCHANG_MAX_DATE}.`);
  return { ...computeDay(date, city), eclipses: options.eclipses === false ? [] : eclipsesOn(date, city) };
}

/** Every day of one month, without the eclipse lookup (the month table does not show it). */
export function getPanchangForMonth(year: number, month: number, city: PanchangCity = DEFAULT_PANCHANG_CITY): DailyPanchanga[] {
  if (!parsePanchangMonth(monthKey(year, month))) throw new RangeError(`Panchang is available from ${PANCHANG_MIN_YEAR} to ${PANCHANG_MAX_YEAR}.`);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => computeDay(`${monthKey(year, month)}-${String(index + 1).padStart(2, "0")}`, city));
}
