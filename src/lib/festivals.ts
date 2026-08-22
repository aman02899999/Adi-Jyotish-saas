import "server-only";

import { dailyPanchanga, type DailyPanchanga } from "panchanga";
import { REFERENCE_LOCATION } from "@/lib/panchang";

/** Festival calendar dates are sourced from published 2026 Hindu panchang calendars (the same
 * kind of precomputed festival table every panchang publisher relies on — lunisolar festival
 * dates depend on regional amanta/purnimanta month-naming conventions that are error-prone to
 * re-derive from scratch). The Panchang shown for each date, though, is computed live from the
 * same real astronomical engine as the rest of the site — not looked up. */

export type Festival = {
  slug: string;
  name: string;
  tagline: string;
  date: string;
  rangeLabel: string;
  description: string;
  ritualNote: string;
};

export const FESTIVALS: Festival[] = [
  {
    slug: "navratri",
    name: "Navratri",
    tagline: "Nine nights honoring the Divine Feminine",
    date: "2026-10-01",
    rangeLabel: "October 1 – October 6, 2026",
    description: "Sharad Navratri marks nine nights of worship of the Devi in her nine forms, closing with Vijayadashami (Dussehra) — the triumph of good over evil.",
    ritualNote: "Ghatasthapana (the kalash installation that opens the nine nights) is best done during a stable, auspicious window on day one — check the Abhijit muhurat below.",
  },
  {
    slug: "karva-chauth",
    name: "Karva Chauth",
    tagline: "A day-long fast for a partner's long life and wellbeing",
    date: "2026-10-29",
    rangeLabel: "October 29, 2026",
    description: "Married women observe a sunrise-to-moonrise fast for their husband's longevity, breaking it only after sighting the moon through a sieve.",
    ritualNote: "The fast traditionally begins at sunrise. What matters most is the moonrise time for your own city — the puja and fast-breaking window below is calculated for the reference location.",
  },
  {
    slug: "diwali",
    name: "Diwali",
    tagline: "The festival of lights and Lakshmi Puja",
    date: "2026-11-08",
    rangeLabel: "November 6 – November 10, 2026",
    description: "Five days from Dhanteras to Bhai Dooj, with Lakshmi Puja on the main night — inviting prosperity and clarity into the year ahead.",
    ritualNote: "Lakshmi Puja is classically performed during the evening Pradosh period, avoiding Rahu Kaal — see the windows below for the main night.",
  },
];

export function getFestivalBySlug(slug: string): Festival | undefined {
  return FESTIVALS.find((festival) => festival.slug === slug);
}

/** The next festival that hasn't happened yet this cycle, falling back to the last one in the
 * table if the whole season has already passed (so the page never shows nothing). */
export function getFeaturedFestival(): Festival {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = FESTIVALS.filter((festival) => festival.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? FESTIVALS[FESTIVALS.length - 1];
}

export type FestivalPanchang = {
  tithi: string;
  nakshatra: string;
  vara: string;
  sunrise: string | null;
  sunset: string | null;
  abhijitWindow: { start: string; end: string } | null;
  rahuKalaWindow: { start: string; end: string } | null;
};

/** Real, live-computed Panchang for the festival's specific date — the same astronomical engine
 * used for today's Panchang tool, just pointed at a future date instead of "now". */
export function getFestivalPanchang(festival: Festival): FestivalPanchang {
  const date = new Date(`${festival.date}T12:00:00Z`);
  const panchang: DailyPanchanga = dailyPanchanga(date, REFERENCE_LOCATION);
  return {
    tithi: `${panchang.tithi.name} (${panchang.tithi.paksha === "shukla" ? "Shukla" : "Krishna"} Paksha)`,
    nakshatra: panchang.nakshatra.name,
    vara: panchang.vara.name,
    sunrise: panchang.sunrise,
    sunset: panchang.sunset,
    abhijitWindow: panchang.muhurta.abhijit,
    rahuKalaWindow: panchang.muhurta.rahuKala,
  };
}
