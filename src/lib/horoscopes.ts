import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db, withFirebaseFallback } from "@/lib/firestore";
import { tropicalLongitudeOf } from "@/lib/astro-engine";
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

// [month, day, sign] the sign STARTING on that date, in ascending calendar order. Jan 1–19 defaults to
// Capricorn (its range wraps the year boundary), so it's intentionally absent from this list.
const SIGN_START_BOUNDARIES: Array<[number, number, ZodiacSignKey]> = [
  [1, 20, "aquarius"], [2, 19, "pisces"], [3, 21, "aries"], [4, 20, "taurus"], [5, 21, "gemini"],
  [6, 21, "cancer"], [7, 23, "leo"], [8, 23, "virgo"], [9, 23, "libra"], [10, 23, "scorpio"],
  [11, 22, "sagittarius"], [12, 22, "capricorn"],
];

export function signForBirthDate(birthDate: string): ZodiacSignKey | null {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let sign: ZodiacSignKey = "capricorn";
  for (const [startMonth, startDay, boundarySign] of SIGN_START_BOUNDARIES) {
    if (month > startMonth || (month === startMonth && day >= startDay)) sign = boundarySign;
  }
  return sign;
}

export async function todayCivilDate() {
  const settings = await getStudioSettings();
  return dateInTimeZone(new Date(), settings.timezone);
}

async function tomorrowCivilDate() {
  const settings = await getStudioSettings();
  return dateInTimeZone(new Date(Date.now() + 86400000), settings.timezone);
}

async function weekStartCivilDate() {
  const settings = await getStudioSettings();
  const today = new Date(dateInTimeZone(new Date(), settings.timezone) + "T00:00:00Z");
  const mondayOffset = (today.getUTCDay() + 6) % 7; // days since this week's Monday
  return dateInTimeZone(new Date(today.getTime() - mondayOffset * 86400000), settings.timezone);
}

async function monthKey() {
  const settings = await getStudioSettings();
  return dateInTimeZone(new Date(), settings.timezone).slice(0, 7); // YYYY-MM
}

/** Theme of the Moon transiting each house counted from a person's own (Moon) sign —
 * the standard "Chandra transit" framework classical Jyotish daily horoscopes are built on. */
export const HOUSE_THEMES: Record<number, string> = {
  1: "The Moon lights up your own sign today, sharpening your instincts and putting your feelings close to the surface. It's a self-focused day, good for starting something that actually reflects who you are.",
  2: "The Moon turns your attention to money, family, and the things that make you feel grounded. Practical decisions — a purchase, a budget, a conversation with family — land well today.",
  3: "The Moon energizes courage, communication, and short trips. A conversation or message you've been putting off is easier to start today than it will feel tomorrow.",
  4: "The Moon settles into your house of home and emotional comfort. You may want to slow down, spend time with family, or simply be somewhere familiar — that instinct is worth honoring.",
  5: "The Moon lights up creativity, romance, and anything that lets you think for yourself. It's a good day for a creative project, a date, or trusting your own judgment over everyone else's advice.",
  6: "The Moon highlights work, routine, and small obstacles. Problems that show up today are usually more manageable than they first appear — deal with them directly rather than avoiding them.",
  7: "The Moon activates your house of partnership. Conversations with a spouse, close partner, or collaborator carry extra weight today — say the honest thing, gently.",
  8: "The Moon moves through a more private, intense house today. Energy may feel lower or emotions closer to the surface than usual — this is a better day for rest and reflection than for big decisions.",
  9: "The Moon lifts your house of fortune, learning, and travel. Bigger-picture thinking — planning ahead, studying, or a journey — flows more easily than usual today.",
  10: "The Moon sits in your house of career and public standing. Your work is more visible than usual today, for better or worse — it's a good day to do your best work in front of others.",
  11: "The Moon brightens your house of gains and friendships. Financial news, social plans, or progress toward a goal you've been chasing are more likely to land in your favor today.",
  12: "The Moon withdraws into your house of rest and letting go. Today rewards quiet over hustle — sleep, solitude, or simply finishing something rather than starting something new.",
};

/** One-line version of each house's theme, for the week-ahead summary (which touches several
 * houses and has no room for the full daily paragraph). */
const HOUSE_HEADLINES: Record<number, string> = {
  1: "a self-focused stretch — good for starting things that reflect who you actually are",
  2: "money, family, and groundedness come into focus",
  3: "communication and short trips get easier",
  4: "home and emotional comfort take priority",
  5: "creativity, romance, and your own judgment lead",
  6: "work and routine surface, but stay manageable",
  7: "partnership conversations carry extra weight",
  8: "a quieter, more private stretch — better for reflection than big decisions",
  9: "bigger-picture thinking, planning, and travel flow easily",
  10: "your work becomes more visible than usual",
  11: "gains, goals, and friendships move in your favor",
  12: "rest and letting go are rewarded over hustle",
};

/** Sun's monthly transit through each house — the standard basis for a month-ahead Vedic outlook,
 * since the Sun (unlike the fast-moving Moon) spends roughly a month per sign. */
const SUN_MONTH_THEMES: Record<number, string> = {
  1: "The Sun lights up your own sign this month, putting your energy, health, and sense of self in the spotlight. It's a strong stretch for anything that starts with you — a habit, a decision, a fresh start.",
  2: "The Sun moves through your house of money and family this month. Financial matters and conversations with family are more prominent than usual — worth giving them proper attention rather than putting them off.",
  3: "The Sun energizes courage, communication, and initiative this month. Projects that need you to speak up, pitch, or simply push forward move more easily now than they will later.",
  4: "The Sun settles into your house of home and inner life this month. Domestic matters, property, or simply your sense of emotional security ask for attention — tend to your foundations.",
  5: "The Sun brightens creativity, romance, and self-expression this month. It's a strong period for a creative project, a relationship, or anything that lets your own ideas lead.",
  6: "The Sun highlights work, health, and daily discipline this month. Steady, unglamorous effort pays off more than usual — a good stretch to fix a routine or resolve a lingering obligation.",
  7: "The Sun activates partnership this month — business or personal. Agreements, negotiations, and close relationships are more consequential now, so approach them deliberately.",
  8: "The Sun moves through a deeper, more transformative house this month. Shared resources, inherited matters, or simply personal transformation are the themes — not a month to rush.",
  9: "The Sun lifts your house of fortune, belief, and learning this month. Travel, higher study, or a mentor's guidance are especially well-supported now.",
  10: "The Sun climbs into your house of career and public standing this month — one of the strongest transits for visibility and recognition at work. Put your best effort where people can see it.",
  11: "The Sun brightens gains, networks, and long-term goals this month. Financial progress and support from friends or community are more available than usual.",
  12: "The Sun withdraws into your house of rest and closure this month. It favors finishing what's unfinished and stepping back before the next cycle begins, rather than launching something new.",
};

function relativeHouse(signRashiIndex: number, moonRashiIndex: number) {
  return ((moonRashiIndex - signRashiIndex + 12) % 12) + 1;
}

function generateHoroscopeText(signIndex: number, date: Date = new Date()) {
  const moonLongitude = tropicalLongitudeOf(date, "moon");
  const moonSignIndex = Math.floor(moonLongitude / 30);
  const house = relativeHouse(signIndex, moonSignIndex);
  const theme = HOUSE_THEMES[house];
  return `${theme}\n\nThe Moon is currently transiting ${ZODIAC_SIGNS[moonSignIndex].name}. Use today's mood as information, not instruction — notice it, then choose deliberately.`;
}

function generateWeekAheadText(signIndex: number, weekStart: Date) {
  const housesTouched: number[] = [];
  for (let day = 0; day < 7; day += 2) {
    const date = new Date(weekStart.getTime() + day * 86400000);
    const moonSignIndex = Math.floor(tropicalLongitudeOf(date, "moon") / 30);
    const house = relativeHouse(signIndex, moonSignIndex);
    if (housesTouched[housesTouched.length - 1] !== house) housesTouched.push(house);
  }
  const beats = housesTouched.map((house) => HOUSE_HEADLINES[house]);
  const summary = beats.length > 1
    ? `${beats.slice(0, -1).join("; then ")}; and toward the week's end, ${beats[beats.length - 1]}.`
    : `${beats[0]}.`;
  return `Over the week ahead, the Moon moves through several of your houses in turn: ${summary}\n\nTreat each shift as a change in weather, not a verdict — the theme passes, your choices in it don't.`;
}

function generateMonthAheadText(signIndex: number, monthDate: Date) {
  const sunLongitude = tropicalLongitudeOf(monthDate, "sun");
  const sunSignIndex = Math.floor(sunLongitude / 30);
  const house = relativeHouse(signIndex, sunSignIndex);
  const theme = SUN_MONTH_THEMES[house];
  return `${theme}\n\nThe Sun is transiting ${ZODIAC_SIGNS[sunSignIndex].name} this month. This is the season's overall tone, not a fixed script — the details still come from what you do with it.`;
}

export type DailyHoroscope = { id: string; sign: string; date: string; content: string; createdAt: Date };

export async function getDailyHoroscope(sign: ZodiacSignKey): Promise<DailyHoroscope> {
  const definition = ZODIAC_SIGNS.find((entry) => entry.key === sign);
  if (!definition) throw new Error("Unknown zodiac sign.");
  const signIndex = ZODIAC_SIGNS.findIndex((entry) => entry.key === sign);
  const date = await todayCivilDate();
  const docId = `${sign}_${date}`;
  const fallbackContent = generateHoroscopeText(signIndex);

  return withFirebaseFallback(async () => {
    const ref = db.collection("dailyHoroscopes").doc(docId);

    const existing = await ref.get();
    if (existing.exists) {
      const data = existing.data() as { sign: string; date: string; content: string; createdAt: FirebaseFirestore.Timestamp };
      return { id: docId, sign: data.sign, date: data.date, content: data.content, createdAt: data.createdAt?.toDate() ?? new Date() };
    }

    const content = fallbackContent;
    // create() rather than set() so a concurrent request for the same sign+date races safely —
    // the loser's create() throws (doc already exists) and we just re-read what won.
    try {
      await ref.create({ sign, date, content, createdAt: FieldValue.serverTimestamp() });
    } catch {
      // Already created by a concurrent request — fall through to read it below.
    }

    const finalSnap = await ref.get();
    const data = finalSnap.data() as { sign: string; date: string; content: string; createdAt: FirebaseFirestore.Timestamp };
    return { id: docId, sign: data.sign, date: data.date, content: data.content, createdAt: data.createdAt?.toDate() ?? new Date() };
  }, { id: docId, sign, date, content: fallbackContent, createdAt: new Date() }, "getDailyHoroscope");
}

export const HOROSCOPE_PERIODS = ["today", "tomorrow", "week", "month"] as const;
export type HoroscopePeriod = (typeof HOROSCOPE_PERIODS)[number];
export function isHoroscopePeriod(value: string): value is HoroscopePeriod {
  return (HOROSCOPE_PERIODS as readonly string[]).includes(value);
}

export type PeriodHoroscope = { sign: string; period: HoroscopePeriod; dateLabel: string; content: string };

/** Today/tomorrow reuse the same per-day cache as getDailyHoroscope (keyed by the exact date the
 * reading describes); week/month use their own cache keyed by week-start / year-month. */
export async function getHoroscopeForPeriod(sign: ZodiacSignKey, period: HoroscopePeriod): Promise<PeriodHoroscope> {
  const signIndex = ZODIAC_SIGNS.findIndex((entry) => entry.key === sign);
  const definition = ZODIAC_SIGNS[signIndex];
  if (!definition) throw new Error("Unknown zodiac sign.");

  if (period === "today") {
    const { date, content } = await getDailyHoroscope(sign);
    return { sign, period, dateLabel: new Date(`${date}T00:00:00`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" }), content };
  }
  if (period === "tomorrow") {
    const date = await tomorrowCivilDate();
    const docId = `${sign}_${date}`;
    const content = await readOrCreateHoroscope(docId, sign, date, () => generateHoroscopeText(signIndex, new Date(`${date}T12:00:00Z`)));
    return { sign, period, dateLabel: new Date(`${date}T00:00:00`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" }), content };
  }
  if (period === "week") {
    const weekStart = await weekStartCivilDate();
    const docId = `${sign}_week_${weekStart}`;
    const weekStartDate = new Date(`${weekStart}T12:00:00Z`);
    const content = await readOrCreateHoroscope(docId, sign, weekStart, () => generateWeekAheadText(signIndex, weekStartDate));
    const weekEndDate = new Date(weekStartDate.getTime() + 6 * 86400000);
    return { sign, period, dateLabel: `${weekStartDate.toLocaleDateString("en", { month: "short", day: "numeric" })} – ${weekEndDate.toLocaleDateString("en", { month: "short", day: "numeric" })}`, content };
  }
  const month = await monthKey();
  const docId = `${sign}_month_${month}`;
  const monthDate = new Date(`${month}-15T12:00:00Z`);
  const content = await readOrCreateHoroscope(docId, sign, month, () => generateMonthAheadText(signIndex, monthDate));
  return { sign, period, dateLabel: monthDate.toLocaleDateString("en", { month: "long", year: "numeric" }), content };
}

async function readOrCreateHoroscope(docId: string, sign: string, date: string, generate: () => string): Promise<string> {
  return withFirebaseFallback(async () => {
    const ref = db.collection("dailyHoroscopes").doc(docId);
    const existing = await ref.get();
    if (existing.exists) return (existing.data() as { content: string }).content;

    const content = generate();
    try {
      await ref.create({ sign, date, content, createdAt: FieldValue.serverTimestamp() });
    } catch {
      // Already created by a concurrent request — fall through to read it below.
    }
    const finalSnap = await ref.get();
    return (finalSnap.data() as { content: string }).content;
  }, generate(), `readOrCreateHoroscope:${docId}`);
}
