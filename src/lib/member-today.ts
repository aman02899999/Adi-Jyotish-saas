import "server-only";

import { dailyPanchanga } from "panchanga";
import { GRAHA_LABELS } from "@/lib/astro-engine";
import { computeVimshottari } from "@/lib/vedic/vimshottari";

/**
 * The member dashboard's "today", computed rather than written: the Panchang for the member's own
 * city (the birth place on their chart, else New Delhi) and the dasha periods running in their
 * chart right now. The dashboard used to show a fixed "10:42 – 11:28 AM" Abhijit Muhurat to every
 * member on every day, and a "Live Insight" that was the same sentence for everyone.
 */

type Window = { start: string; end: string };

export type MemberToday = {
  placeLabel: string;
  timeZone: string;
  vara: string;
  tithi: string;
  nakshatra: { name: string; endsAt: string | null };
  abhijit: Window | null;
  rahuKala: Window | null;
};

const PAKSHA_LABEL: Record<string, string> = { shukla: "Shukla", krishna: "Krishna" };

export function buildMemberToday({ civilDate, latitude, longitude, timeZone, placeLabel }: {
  civilDate: string; latitude: number; longitude: number; timeZone: string; placeLabel: string;
}): MemberToday {
  const panchang = dailyPanchanga(new Date(`${civilDate}T12:00:00Z`), { latitude, longitude, timeZone });
  const window = (value: unknown): Window | null => {
    const candidate = value as Partial<Window> | null | undefined;
    return candidate?.start && candidate?.end ? { start: String(candidate.start), end: String(candidate.end) } : null;
  };
  const muhurta = panchang.muhurta as unknown as Record<string, unknown>;
  const tithi = panchang.tithi as unknown as { name: string; paksha?: string };
  const nakshatra = panchang.nakshatra as unknown as { name: string; endsAt?: string | Date | null };
  return {
    placeLabel,
    timeZone,
    vara: panchang.vara.name,
    tithi: [PAKSHA_LABEL[tithi.paksha ?? ""], tithi.name].filter(Boolean).join(" "),
    nakshatra: { name: nakshatra.name, endsAt: nakshatra.endsAt ? new Date(nakshatra.endsAt).toISOString() : null },
    abhijit: window(muhurta.abhijit),
    rahuKala: window(muhurta.rahuKala),
  };
}

/** "upcoming", "now" or "passed", for a window relative to the given moment. */
export function windowStatus(window: Window, now = new Date()): "upcoming" | "now" | "passed" {
  if (now < new Date(window.start)) return "upcoming";
  return now <= new Date(window.end) ? "now" : "passed";
}

export type RunningDasha = { maha: { lord: string; end: string }; antar: { lord: string; end: string } | null };

/** The Mahadasha and Antardasha running on `asOf` for a Moon at this longitude at birth. */
export function runningDasha(moonLongitude: number, birthInstant: Date, asOf = new Date()): RunningDasha | null {
  const { mahadashas } = computeVimshottari(moonLongitude, birthInstant, { depth: 2, cycles: 2 });
  const maha = mahadashas.find((period) => period.start <= asOf && asOf < period.end);
  if (!maha) return null;
  const antar = maha.children.find((period) => period.start <= asOf && asOf < period.end) ?? null;
  const label = (lord: keyof typeof GRAHA_LABELS) => GRAHA_LABELS[lord];
  return {
    maha: { lord: label(maha.lord), end: maha.end.toISOString() },
    antar: antar ? { lord: label(antar.lord), end: antar.end.toISOString() } : null,
  };
}
