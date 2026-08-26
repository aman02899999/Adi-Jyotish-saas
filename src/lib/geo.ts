import "server-only";

import tzLookup from "tz-lookup";
import cityRows from "@/lib/geo-data/cities.json";
import { civilToUtc } from "@/lib/scheduling";

export type ResolvedPlace = {
  matchedName: string;
  province: string | null;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
};

export type PlaceSuggestion = {
  id: string;
  label: string;
  city: string;
  province: string | null;
  country: string;
};

type CityRecord = {
  id: string;
  name: string;
  altName: string;
  nameLower: string;
  altNameLower: string;
  province: string | null;
  /** Always populated (falls back to the raw GeoNames adminCode) — used only to tell two
   * same-named, same-country settlements apart for ambiguity detection, never displayed. Outside
   * India, `province` itself is null whenever the raw code isn't a human-readable abbreviation
   * (see loadCities), so this is what keeps e.g. Missouri vs. Illinois Springfield distinct even
   * though neither gets a friendly province name shown to the user. */
  regionKey: string;
  country: string;
  population: number;
  lat: number;
  lon: number;
};

// GeoNames admin1 codes for India, as used by the `all-the-cities` dataset (derived from GeoNames'
// cities-with-population-1000+ dump). GeoNames assigns these per-country and doesn't ship a name
// alongside them in this package, so the mapping below was reverse-engineered by cross-referencing
// well-known state-capital/major-city anchors against their adminCode in the bundled data (e.g.
// Lucknow/Noida -> "36" -> Uttar Pradesh, Jaipur -> "24" -> Rajasthan). Code "10" is Haryana except
// for a single stray "Gorakhpur" row (a real Uttar Pradesh city) that the upstream GeoNames snapshot
// mis-tagged — a known, isolated data-quality quirk we don't attempt to patch row-by-row.
const INDIA_ADMIN1: Record<string, string> = {
  "01": "Andaman and Nicobar Islands",
  "02": "Andhra Pradesh",
  "03": "Assam",
  "05": "Chandigarh",
  "06": "Dadra and Nagar Haveli and Daman and Diu",
  "07": "Delhi",
  "09": "Gujarat",
  "10": "Haryana",
  "11": "Himachal Pradesh",
  "12": "Jammu and Kashmir",
  "13": "Kerala",
  "14": "Lakshadweep",
  "16": "Maharashtra",
  "17": "Manipur",
  "18": "Meghalaya",
  "19": "Karnataka",
  "20": "Nagaland",
  "21": "Odisha",
  "22": "Puducherry",
  "23": "Punjab",
  "24": "Rajasthan",
  "25": "Tamil Nadu",
  "26": "Tripura",
  "28": "West Bengal",
  "29": "Sikkim",
  "30": "Arunachal Pradesh",
  "31": "Mizoram",
  "32": "Dadra and Nagar Haveli and Daman and Diu",
  "33": "Goa",
  "34": "Bihar",
  "35": "Madhya Pradesh",
  "36": "Uttar Pradesh",
  "37": "Chhattisgarh",
  "38": "Jharkhand",
  "39": "Uttarakhand",
  "40": "Telangana",
  "41": "Ladakh",
};

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryNameFor(code: string): string {
  if (code === "IN") return "India";
  try {
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
}

const INDIA_STATE_NAMES = new Set(Object.values(INDIA_ADMIN1).map((name) => name.toLowerCase()));
// Segments that name the country/state itself (not a settlement) — used to keep the "is this
// segment plausibly a place name" search from treating "India" or "Uttar Pradesh" as a city
// candidate, which is what previously produced nonsense matches like "Indianapolis" / "Kindia".
const NON_SETTLEMENT_SEGMENTS = new Set(["india", "bharat", "in", ...INDIA_STATE_NAMES]);

let cachedCities: CityRecord[] | null = null;

// [name, altName, countryCode, adminCode, population, lat*1e5, lon*1e5] — see
// scripts/generate-geo-cities.mjs, which produces src/lib/geo-data/cities.json in this shape.
type RawCityRow = [string, string, string, string, number, number, number];

function loadCities(): CityRecord[] {
  if (cachedCities) return cachedCities;
  cachedCities = (cityRows as RawCityRow[]).map(([name, altName, countryCode, adminCode, population, latE5, lonE5]) => {
    // Outside India, `adminCode` is GeoNames' own admin1 code with no bundled name lookup (unlike
    // India, which we mapped by hand above) — for some countries (notably the US) it happens to be
    // a readable postal abbreviation ("IL", "OH"), which we show; for most others it's an opaque
    // number ("07", "18"), which we suppress rather than show a meaningless digit.
    const province = countryCode === "IN" ? (INDIA_ADMIN1[adminCode] ?? null) : (/^[A-Za-z]/.test(adminCode) ? adminCode : null);
    return {
      id: `${countryCode}-${name}-${latE5}-${lonE5}`,
      name,
      altName,
      nameLower: name.toLowerCase(),
      altNameLower: altName.toLowerCase(),
      province,
      regionKey: adminCode,
      country: countryNameFor(countryCode),
      population,
      lat: latE5 / 1e5,
      lon: lonE5 / 1e5,
    };
  });
  return cachedCities;
}

function labelFor(row: CityRecord): string {
  return [row.name, row.province, row.country].filter(Boolean).join(", ");
}

function toResolvedPlace(row: CityRecord): ResolvedPlace {
  return { matchedName: labelFor(row), province: row.province, country: row.country, lat: row.lat, lon: row.lon, timezone: tzLookup(row.lat, row.lon) };
}

export class PlaceNotFoundError extends Error {}

/** Thrown instead of silently guessing when a place name matches more than one genuinely
 * different city — e.g. "Toledo" (Ohio, USA vs. Spain) or "Springfield" (multiple US states).
 * Extends PlaceNotFoundError so every existing catch site (which checks `instanceof
 * PlaceNotFoundError`) already handles this correctly with no other file changes. */
export class AmbiguousPlaceError extends PlaceNotFoundError {}

/** Collapses rows to one per distinct (country, region) pair, keyed by the always-populated
 * regionKey rather than the display-only province (which is deliberately blank for countries
 * whose GeoNames admin1 code isn't a human-readable abbreviation) — so two real, different
 * settlements that happen to share a name still count as genuinely ambiguous even when neither
 * gets a friendly province name shown. Keeps the most populous row for each. */
function distinctPlacesOf(rows: CityRecord[]): CityRecord[] {
  const best = new Map<string, CityRecord>();
  for (const row of rows) {
    const key = `${row.country.toLowerCase()}|${row.regionKey.toLowerCase()}`;
    const existing = best.get(key);
    if (!existing || row.population > existing.population) best.set(key, row);
  }
  return [...best.values()];
}

function pickBest(rows: CityRecord[], otherSegments: string[], rawPlaceText: string): CityRecord | null {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];

  const lowerSegments = otherSegments.map((segment) => segment.toLowerCase());
  const narrowed = lowerSegments.length
    ? rows.filter((row) => lowerSegments.some((segment) =>
        (row.province && row.province.toLowerCase().includes(segment)) ||
        row.country.toLowerCase().includes(segment)
      ))
    : [];

  const pool = narrowed.length ? narrowed : rows;
  const distinctPlaces = distinctPlacesOf(pool);

  if (distinctPlaces.length > 1) {
    const options = distinctPlaces
      .sort((a, b) => b.population - a.population)
      .slice(0, 5)
      .map(labelFor)
      .join(" / ");
    throw new AmbiguousPlaceError(`"${rawPlaceText}" matches more than one place — please add the state/province and country to be specific, for example: ${options}.`);
  }

  return pool.reduce((best, row) => (row.population > best.population ? row : best), pool[0]);
}

/** Exact (case-insensitive) match on a city's primary or alternate name. */
function exactMatches(term: string): CityRecord[] {
  const needle = term.toLowerCase();
  return loadCities().filter((row) => row.nameLower === needle || row.altNameLower === needle);
}

/** Prefix match on a city's primary or alternate name — used only as a last resort, and only
 * against a segment that isn't itself a country/state name (see NON_SETTLEMENT_SEGMENTS), so a
 * country like "India" in the input can never itself be searched as if it were a city. */
function prefixMatches(term: string): CityRecord[] {
  const needle = term.toLowerCase();
  if (needle.length < 3) return [];
  return loadCities().filter((row) => row.nameLower.startsWith(needle) || row.altNameLower.startsWith(needle));
}

/**
 * Resolves a free-text birth place (e.g. "Noida, Uttar Pradesh, India" or "Springfield, Illinois")
 * to coordinates + IANA timezone using the bundled offline world-cities database (India covered in
 * full detail — 3,500+ towns and cities, not just state capitals) — no external geocoding calls, no
 * rate limits, no ongoing cost. Returns null if no reasonable match is found, in which case the
 * caller should ask for a better-known nearby city.
 */
export function resolvePlaceToCoordinates(placeText: string): ResolvedPlace | null {
  const segments = placeText.split(",").map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) return null;

  // Segments that just name a country/state (e.g. "India", "Uttar Pradesh") are never searched as
  // if they were a settlement name — they're only used below to disambiguate real city matches.
  const settlementSegments = segments.filter((segment) => !NON_SETTLEMENT_SEGMENTS.has(segment.toLowerCase()));
  const trySegments = settlementSegments.length ? settlementSegments : segments;

  for (const primary of trySegments) {
    const otherSegments = segments.filter((segment) => segment !== primary);
    const exact = exactMatches(primary);
    const bestExact = pickBest(exact, otherSegments, placeText);
    if (bestExact) return toResolvedPlace(bestExact);
  }

  for (const primary of trySegments) {
    const otherSegments = segments.filter((segment) => segment !== primary);
    const fuzzy = prefixMatches(primary);
    const bestFuzzy = pickBest(fuzzy, otherSegments, placeText);
    if (bestFuzzy) return toResolvedPlace(bestFuzzy);
  }

  return null;
}

/**
 * Live typeahead suggestions for a birth-place input, India-first: an India settlement whose name
 * starts with the query is ranked ahead of an equally-popular match elsewhere, since this is an
 * India-focused product, but the rest of the world is still searchable (diaspora members, foreign
 * practitioners, etc.). Returns canonical "City, State, Country" labels — selecting one guarantees
 * resolvePlaceToCoordinates() above resolves it via the exact-match path, no ambiguity possible.
 */
export function searchPlaces(query: string, limit = 8): PlaceSuggestion[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const scored: { row: CityRecord; score: number }[] = [];
  for (const row of loadCities()) {
    const nameStarts = row.nameLower.startsWith(needle) || row.altNameLower.startsWith(needle);
    const nameIncludes = !nameStarts && (row.nameLower.includes(needle) || row.altNameLower.includes(needle));
    if (!nameStarts && !nameIncludes) continue;
    const indiaBonus = row.country === "India" ? 2_000_000_000 : 0;
    const prefixBonus = nameStarts ? 1_000_000_000 : 0;
    scored.push({ row, score: indiaBonus + prefixBonus + row.population });
  }
  scored.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const { row } of scored) {
    const label = labelFor(row);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ id: row.id, label, city: row.name, province: row.province, country: row.country });
    if (out.length >= limit) break;
  }
  return out;
}

/** Resolves birth date+time+place into an exact UTC instant + coordinates, ready for astro-engine. */
export function resolveBirthMoment({ birthDate, birthTime, birthPlace }: { birthDate: string; birthTime: string; birthPlace: string }) {
  const place = resolvePlaceToCoordinates(birthPlace);
  if (!place) throw new PlaceNotFoundError(`We couldn't recognize "${birthPlace}" — please try a nearby major city or the state/country name too.`);
  const utcInstant = civilToUtc(birthDate, birthTime, place.timezone);
  return { utcInstant, place };
}
