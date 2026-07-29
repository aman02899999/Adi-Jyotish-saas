import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dailyHoroscopes } from "@/db/schema";
import { getDailyHoroscopeText, isGeminiConfigured } from "@/lib/gemini";
import { dateInTimeZone } from "@/lib/scheduling";
import { getStudioSettings } from "@/lib/studio-settings";

export const ZODIAC_SIGNS = [
  { key: "aries", name: "Aries", symbol: "♈", dates: "Mar 21 – Apr 19" },
  { key: "taurus", name: "Taurus", symbol: "♉", dates: "Apr 20 – May 20" },
  { key: "gemini", name: "Gemini", symbol: "♊", dates: "May 21 – Jun 20" },
  { key: "cancer", name: "Cancer", symbol: "♋", dates: "Jun 21 – Jul 22" },
  { key: "leo", name: "Leo", symbol: "♌", dates: "Jul 23 – Aug 22" },
  { key: "virgo", name: "Virgo", symbol: "♍", dates: "Aug 23 – Sep 22" },
  { key: "libra", name: "Libra", symbol: "♎", dates: "Sep 23 – Oct 22" },
  { key: "scorpio", name: "Scorpio", symbol: "♏", dates: "Oct 23 – Nov 21" },
  { key: "sagittarius", name: "Sagittarius", symbol: "♐", dates: "Nov 22 – Dec 21" },
  { key: "capricorn", name: "Capricorn", symbol: "♑", dates: "Dec 22 – Jan 19" },
  { key: "aquarius", name: "Aquarius", symbol: "♒", dates: "Jan 20 – Feb 18" },
  { key: "pisces", name: "Pisces", symbol: "♓", dates: "Feb 19 – Mar 20" },
] as const;

export type ZodiacSignKey = (typeof ZODIAC_SIGNS)[number]["key"];

export function isZodiacSign(value: string): value is ZodiacSignKey {
  return ZODIAC_SIGNS.some((sign) => sign.key === value);
}

export async function todayCivilDate() {
  const settings = await getStudioSettings();
  return dateInTimeZone(new Date(), settings.timezone);
}

export async function getDailyHoroscope(sign: ZodiacSignKey) {
  const definition = ZODIAC_SIGNS.find((entry) => entry.key === sign);
  if (!definition) throw new Error("Unknown zodiac sign.");
  const date = await todayCivilDate();

  const [existing] = await db.select().from(dailyHoroscopes).where(and(eq(dailyHoroscopes.sign, sign), eq(dailyHoroscopes.date, date))).limit(1);
  if (existing) return existing;

  if (!isGeminiConfigured()) throw new Error("Horoscopes are not configured yet. Please try again shortly.");
  const content = await getDailyHoroscopeText({ signName: definition.name, date });

  await db.insert(dailyHoroscopes).values({ sign, date, content }).onConflictDoNothing({ target: [dailyHoroscopes.sign, dailyHoroscopes.date] });
  const [row] = await db.select().from(dailyHoroscopes).where(and(eq(dailyHoroscopes.sign, sign), eq(dailyHoroscopes.date, date))).limit(1);
  return row!;
}
