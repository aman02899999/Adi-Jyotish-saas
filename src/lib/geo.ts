import "server-only";

import cityTimezones from "city-timezones";
import { civilToUtc } from "@/lib/scheduling";

export type ResolvedPlace = {
  matchedName: string;
  province: string | null;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
};

type CityRow = {
  city: string;
  city_ascii: string;
  lat: number;
  lng: number;
  pop?: number;
  country: string;
  province?: string;
  timezone: string;
};

function toResolvedPlace(row: CityRow): ResolvedPlace {
  return {
    matchedName: [row.city, row.province, row.country].filter(Boolean).join(", "),
    province: row.province ?? null,
    country: row.country,
    lat: row.lat,
    lon: row.lng,
    timezone: row.timezone,
  };
}

function pickBest(rows: CityRow[], otherSegments: string[]): CityRow | null {
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
  return pool.reduce((best, row) => ((row.pop ?? 0) > (best.pop ?? 0) ? row : best), pool[0]);
}

function substringSearch(term: string): CityRow[] {
  const needle = term.toLowerCase();
  if (needle.length < 3) return [];
  return (cityTimezones.cityMapping as CityRow[]).filter((row) => row.city_ascii.toLowerCase().includes(needle));
}

/**
 * Resolves a free-text birth place (e.g. "Mumbai, India" or "Springfield, Illinois") to
 * coordinates + IANA timezone using the bundled offline city database — no external
 * geocoding calls, no rate limits, no ongoing cost. Returns null if no reasonable match
 * is found, in which case the caller should ask for a better-known nearby city.
 */
export function resolvePlaceToCoordinates(placeText: string): ResolvedPlace | null {
  const segments = placeText.split(",").map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) return null;

  for (let index = 0; index < segments.length; index += 1) {
    const primary = segments[index];
    const otherSegments = segments.filter((_, i) => i !== index);

    const exact = cityTimezones.lookupViaCity(primary) as CityRow[];
    const bestExact = pickBest(exact, otherSegments);
    if (bestExact) return toResolvedPlace(bestExact);
  }

  for (const segment of segments) {
    const fuzzy = substringSearch(segment);
    const bestFuzzy = pickBest(fuzzy, segments.filter((other) => other !== segment));
    if (bestFuzzy) return toResolvedPlace(bestFuzzy);
  }

  return null;
}

export class PlaceNotFoundError extends Error {}

/** Resolves birth date+time+place into an exact UTC instant + coordinates, ready for astro-engine. */
export function resolveBirthMoment({ birthDate, birthTime, birthPlace }: { birthDate: string; birthTime: string; birthPlace: string }) {
  const place = resolvePlaceToCoordinates(birthPlace);
  if (!place) throw new PlaceNotFoundError(`We couldn't recognize "${birthPlace}" — please try a nearby major city or the state/country name too.`);
  const utcInstant = civilToUtc(birthDate, birthTime, place.timezone);
  return { utcInstant, place };
}

