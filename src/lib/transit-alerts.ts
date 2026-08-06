import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { computeGrahaPositions, RASHIS } from "@/lib/astro-engine";
import { buildKundliChart, KundliEngineError } from "@/lib/kundli-engine";
import { HOUSE_THEMES } from "@/lib/horoscopes";
import { createNotification } from "@/lib/notifications";

/** Personalized transit ("gochar") tracking — the one thing every generic sun-sign horoscope
 * can't do: this reads transits against a member's own natal Moon sign, computed from their real
 * birth chart, not a one-in-twelve zodiac bucket. Jupiter and Saturn are the two transits
 * classical Jyotish treats as genuinely significant (they move slowly enough that a house change
 * is a real, roughly year-to-multi-year event, unlike the Moon which changes house every ~2 days)
 * — so those are what get surfaced as "active" alerts, including the well-known Sade Sati
 * (Saturn transiting the 12th/1st/2nd house from natal Moon). */

const JUPITER_HOUSE_THEMES: Record<number, string> = {
  1: "Jupiter is transiting your own Moon sign — a broad, roughly year-long window of visible growth, confidence, and expanding opportunity. Good stretch to start things, not just plan them.",
  2: "Jupiter is transiting your house of wealth and family. Financial growth, family harmony, and honest, well-spoken words carry extra weight through this period.",
  3: "Jupiter is transiting your house of courage and effort. Your own initiative — not luck — is what this period rewards; short trips and skill-building both go well.",
  4: "Jupiter is transiting your house of home and inner peace. Property, family life, and emotional contentment are supported; a good period to put down roots.",
  5: "Jupiter is transiting your house of intelligence, creativity, and children. Study, creative work, romance, and long-term planning all benefit from this period's optimism.",
  6: "Jupiter is transiting your house of work and daily obstacles. Debts and disputes tend to resolve more easily than usual, and steady effort at work is well rewarded.",
  7: "Jupiter is transiting your house of partnership. Marriage, business partnerships, and significant agreements are especially well-supported through this period.",
  8: "Jupiter is transiting a more private, transformative house. Growth here tends to be internal rather than visible — a good period for research, inheritance matters, or deep change, less so for public launches.",
  9: "Jupiter is transiting your house of fortune and higher learning — classically one of its strongest placements. Travel, higher study, faith, and long-term luck are all elevated.",
  10: "Jupiter is transiting your house of career and public standing. Recognition, promotion, and visible professional growth are well-supported through this period.",
  11: "Jupiter is transiting your house of gains — another especially strong placement. Income, the fulfillment of long-held goals, and support from your network are favored.",
  12: "Jupiter is transiting your house of rest and release. This period favors quiet spiritual growth, travel abroad, or closing old chapters over new public ventures.",
};

const SATURN_HOUSE_THEMES: Record<number, string> = {
  1: "Saturn is transiting your own Moon sign — the peak of Sade Sati. Expect a period (spanning roughly two and a half years total) that asks for discipline and patience; what you build carefully now tends to last.",
  2: "Saturn is transiting your house of wealth and family — the closing phase of Sade Sati if it began in your 12th house. Financial discipline and honest reassessment of family responsibilities are the themes.",
  3: "Saturn is transiting your house of courage and effort. Steady, unglamorous persistence pays off more than bursts of enthusiasm through this multi-year period.",
  4: "Saturn is transiting your house of home and emotional foundation. Domestic responsibilities or a slower, more grounded home life are likely — treat it as reinforcement, not restriction.",
  5: "Saturn is transiting your house of intelligence and children. Learning and creative work ask for more discipline and less inspiration-chasing than usual during this period.",
  6: "Saturn is transiting your house of work and obstacles — one of its classically stronger placements. Sustained effort against real challenges tends to be rewarded here.",
  7: "Saturn is transiting your house of partnership. Relationships and agreements are tested for durability during this period — what's solid tends to hold, what isn't shows its cracks.",
  8: "Saturn is transiting a deep, transformative house. This period can feel heavier than most — it favors patience, inner work, and letting go of what no longer serves you.",
  9: "Saturn is transiting your house of fortune and belief. Long-held beliefs or your relationship with mentors and higher learning may be restructured — slowly, but for the better.",
  10: "Saturn is transiting your house of career — one of its classically strongest, most rewarding placements. Sustained professional effort during this period tends to build a lasting reputation.",
  11: "Saturn is transiting your house of gains. Income and goals grow more slowly than usual but on firmer ground — patience with long-term plans is rewarded here.",
  12: "Saturn is transiting your house of rest and closure — the opening phase of Sade Sati if it's just begun. A period for winding down what's finished rather than starting new ventures.",
};

const RAHU_KETU_HOUSE_THEMES: Record<number, string> = {
  1: "in your own Moon sign, intensifying ambition and how you present yourself to the world",
  2: "through your house of wealth and family, unsettling and reshaping financial habits",
  3: "through your house of courage, sharpening ambition and communication",
  4: "through your house of home, unsettling domestic routines before they resettle",
  5: "through your house of creativity and children, stirring unconventional ideas",
  6: "through your house of work, intensifying both effort and obstacles",
  7: "through your house of partnership, adding intensity to close relationships",
  8: "through your deep, transformative house, accelerating change beneath the surface",
  9: "through your house of belief, unsettling long-held convictions",
  10: "through your house of career, adding ambition and unconventional turns to your public life",
  11: "through your house of gains, stirring unconventional routes to income and goals",
  12: "through your house of rest, unsettling sleep and quiet time before it resettles",
};

export type CosmicWeather = {
  moonHouse: number;
  moonTheme: string;
  moonSignName: string;
  activeTransits: { graha: "jupiter" | "saturn"; house: number; theme: string; isNew: boolean }[];
  sadeSatiPhase: "rising" | "peak" | "setting" | null;
  rahuKetuNote: string;
};

function relativeHouse(fromRashiIndex: number, toRashiIndex: number) {
  return ((toRashiIndex - fromRashiIndex + 12) % 12) + 1;
}

function sadeSatiPhaseFromHouse(house: number): "rising" | "peak" | "setting" | null {
  if (house === 12) return "rising";
  if (house === 1) return "peak";
  if (house === 2) return "setting";
  return null;
}

type StoredHouses = { moon?: number; jupiter?: number; saturn?: number; rahu?: number; ketu?: number };

function weatherDoc(memberId: string) {
  return db.collection("cosmicWeather").doc(memberId);
}

/** Computes today's transits against the member's natal Moon sign, comparing against the last
 * computed state to detect genuine house changes (the "alert-worthy" events) — and persists the
 * new state so tomorrow's visit can detect the next change. Lazily triggered on dashboard visits
 * rather than a scheduled job, matching the rest of this deployment's no-cron-infra pattern. */
export async function getCosmicWeather(member: { name: string; birthDate: string | null; birthTime: string | null; birthPlace: string | null }, memberId: string): Promise<CosmicWeather | null> {
  if (!member.birthDate || !member.birthTime || !member.birthPlace) return null;

  let chart;
  try {
    chart = buildKundliChart({ name: member.name, birthDate: member.birthDate, birthTime: member.birthTime, birthPlace: member.birthPlace });
  } catch (error) {
    if (error instanceof KundliEngineError) return null;
    throw error;
  }
  const natalMoon = chart.positions.find((p) => p.graha === "moon")!;
  const natalMoonRashiIndex = natalMoon.rashiIndex;

  const today = computeGrahaPositions(new Date());
  const positionOf = (graha: "moon" | "jupiter" | "saturn" | "rahu" | "ketu") => today.find((p) => p.graha === graha)!;

  const moonHouse = relativeHouse(natalMoonRashiIndex, positionOf("moon").rashiIndex);
  const jupiterHouse = relativeHouse(natalMoonRashiIndex, positionOf("jupiter").rashiIndex);
  const saturnHouse = relativeHouse(natalMoonRashiIndex, positionOf("saturn").rashiIndex);
  const rahuHouse = relativeHouse(natalMoonRashiIndex, positionOf("rahu").rashiIndex);
  const ketuHouse = relativeHouse(natalMoonRashiIndex, positionOf("ketu").rashiIndex);

  const ref = weatherDoc(memberId);
  const snap = await ref.get();
  const stored = (snap.data()?.houses as StoredHouses | undefined) ?? {};

  const jupiterIsNew = stored.jupiter !== undefined && stored.jupiter !== jupiterHouse;
  const saturnIsNew = stored.saturn !== undefined && stored.saturn !== saturnHouse;
  const unchanged = stored.moon === moonHouse && stored.jupiter === jupiterHouse && stored.saturn === saturnHouse && stored.rahu === rahuHouse && stored.ketu === ketuHouse;

  // Skips the write when nothing has moved since the last visit — this runs on every dashboard
  // load, and most days a member checks the dashboard more than once, so without this every
  // repeat visit would re-write an identical document.
  if (!unchanged) {
    await ref.set({ houses: { moon: moonHouse, jupiter: jupiterHouse, saturn: saturnHouse, rahu: rahuHouse, ketu: ketuHouse }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  if (jupiterIsNew || saturnIsNew) {
    const changed = [jupiterIsNew ? "Jupiter" : null, saturnIsNew ? "Saturn" : null].filter(Boolean).join(" and ");
    await createNotification({
      recipientType: "member",
      recipientId: memberId,
      type: "cosmic_weather.transit_changed",
      title: `${changed} moved into a new house for you`,
      body: "A significant transit just shifted in your personal chart — see what it means on your dashboard.",
      link: "/dashboard#cosmic-weather",
    }).catch(() => {});
  }

  const rahuTheme = RAHU_KETU_HOUSE_THEMES[rahuHouse];
  const ketuTheme = RAHU_KETU_HOUSE_THEMES[ketuHouse];

  return {
    moonHouse,
    moonTheme: HOUSE_THEMES[moonHouse],
    moonSignName: RASHIS[natalMoonRashiIndex].english,
    activeTransits: [
      { graha: "jupiter", house: jupiterHouse, theme: JUPITER_HOUSE_THEMES[jupiterHouse], isNew: jupiterIsNew },
      { graha: "saturn", house: saturnHouse, theme: SATURN_HOUSE_THEMES[saturnHouse], isNew: saturnIsNew },
    ],
    sadeSatiPhase: sadeSatiPhaseFromHouse(saturnHouse),
    rahuKetuNote: `Rahu is moving ${rahuTheme}, while Ketu moves ${ketuTheme}.`,
  };
}
