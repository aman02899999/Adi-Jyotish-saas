import { DEFAULT_PANCHANG_CITY, monthKey, type PanchangCity } from "@/lib/panchang-archive";

/** Display helpers for the Panchang pages. Pure, so the pages and their tests share one wording. */

function civilDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** "6:44 am" in the city's own clock time. */
export function formatClock(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone, hour: "numeric", minute: "2-digit" });
}

/**
 * A clock time that says so when it falls on another day: a tithi running at sunrise often ends
 * after midnight, and "4:20 am" alone would read as this morning.
 */
export function formatClockOnDay(iso: string | null, pageDate: string, timeZone: string): string {
  if (!iso) return "—";
  const clock = formatClock(iso, timeZone);
  if (civilDate(iso, timeZone) === pageDate) return clock;
  return `${clock}, ${new Date(iso).toLocaleDateString("en-IN", { timeZone, day: "numeric", month: "short" })}`;
}

export function formatWindow(window: { start: string; end: string } | null, timeZone: string): string {
  if (!window) return "—";
  return `${formatClock(window.start, timeZone)} – ${formatClock(window.end, timeZone)}`;
}

/** "16 November 2026" */
export function formatLongDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
}

/** "November 2026" */
export function formatMonthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });
}

export function weekdayIndex(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The address of a day ("2026-11-16") or month ("2026-11") page. The default city has the short one. */
export function panchangPath(dateOrMonth: string, city: PanchangCity = DEFAULT_PANCHANG_CITY): string {
  return city.slug === DEFAULT_PANCHANG_CITY.slug ? `/panchang/${dateOrMonth}` : `/panchang/${dateOrMonth}/${city.slug}`;
}

export function monthPathOf(date: string, city?: PanchangCity): string {
  return panchangPath(monthKey(Number(date.slice(0, 4)), Number(date.slice(5, 7))), city);
}

/**
 * Which pages search engines are invited to index. A hundred years of dates across 28 cities is
 * about two million addresses that differ only in their numbers; inviting all of them in would look
 * like a doorway farm. The default city's pages for last year, this year and next are the ones
 * people search for, so only those are indexable. Everything else still works for visitors.
 */
export function isIndexablePanchangPage(year: number, city: PanchangCity, currentYear: number): boolean {
  return city.slug === DEFAULT_PANCHANG_CITY.slug && Math.abs(year - currentYear) <= 1;
}
