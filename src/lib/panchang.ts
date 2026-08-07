import "server-only";

import { dailyPanchanga, type DailyPanchanga, type GeoLocation } from "panchanga";
import { todayCivilDate } from "@/lib/horoscopes";

/** Reference location for the general daily Panchang (no personal birth data involved). */
export const REFERENCE_LOCATION: GeoLocation = { latitude: 28.6139, longitude: 77.2090, timeZone: "Asia/Kolkata" };
export const REFERENCE_LOCATION_LABEL = "New Delhi, India";

/** Computed live on every call from real astronomical data — the math is cheap pure JS,
 * so there's nothing to cache and no AI involved. */
export async function getTodayPanchang(): Promise<DailyPanchanga> {
  const dateString = await todayCivilDate();
  const date = new Date(`${dateString}T12:00:00Z`);
  return dailyPanchanga(date, REFERENCE_LOCATION);
}
