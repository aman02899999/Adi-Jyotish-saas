import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

/** Consecutive-day dashboard engagement, tracked purely off calendar dates (not session count) —
 * one visit or twenty on the same day both count once, only the first visit of a new day can
 * extend or break the streak. */

export const BADGE_MILESTONES = [
  { days: 3, key: "spark", label: "3-Day Spark" },
  { days: 7, key: "week", label: "Week of Clarity" },
  { days: 14, key: "fortnight", label: "Fortnight Devotee" },
  { days: 30, key: "moonCycle", label: "Full Moon Cycle" },
  { days: 60, key: "twoMoons", label: "Two Moons" },
  { days: 100, key: "century", label: "Century Seeker" },
] as const;

export type BadgeKey = (typeof BADGE_MILESTONES)[number]["key"];

export type StreakStatus = {
  currentStreak: number;
  longestStreak: number;
  badges: BadgeKey[];
  justEarned: BadgeKey | null;
};

// Streak days are calendar days for an India-based audience, not UTC days — without the IST
// offset, a visit between midnight and 5:30am IST reads as the previous UTC date, which can
// wrongly reset or extend a streak for anyone visiting in that window.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function todayIso() {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function daysBetween(earlierIso: string, laterIso: string) {
  const earlier = Date.parse(`${earlierIso}T00:00:00Z`);
  const later = Date.parse(`${laterIso}T00:00:00Z`);
  return Math.round((later - earlier) / 86_400_000);
}

function badgesForStreak(days: number): BadgeKey[] {
  return BADGE_MILESTONES.filter((milestone) => days >= milestone.days).map((milestone) => milestone.key);
}

type StreakDoc = { currentStreak: number; longestStreak: number; lastActiveDate: string; badges: BadgeKey[] };

/** Called once per dashboard load. Cheap no-op if the member already visited today. */
export async function recordDailyVisit(memberId: string): Promise<StreakStatus> {
  const today = todayIso();
  const ref = db.collection("memberStreaks").doc(memberId);
  const snap = await ref.get();
  const stored = snap.data() as StreakDoc | undefined;

  if (stored?.lastActiveDate === today) {
    return { currentStreak: stored.currentStreak, longestStreak: stored.longestStreak, badges: stored.badges ?? [], justEarned: null };
  }

  const gap = stored ? daysBetween(stored.lastActiveDate, today) : null;
  const currentStreak = gap === 1 ? (stored!.currentStreak + 1) : 1;
  const longestStreak = Math.max(stored?.longestStreak ?? 0, currentStreak);
  const badges = badgesForStreak(currentStreak);
  const justEarned = badges.find((badge) => !(stored?.badges ?? []).includes(badge)) ?? null;

  await ref.set({ currentStreak, longestStreak, lastActiveDate: today, badges, updatedAt: FieldValue.serverTimestamp() });
  return { currentStreak, longestStreak, badges, justEarned };
}
