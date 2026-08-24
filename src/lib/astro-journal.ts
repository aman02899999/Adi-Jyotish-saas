import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, withIndexFallback } from "@/lib/firestore";
import { computeGrahaPositions, RASHIS } from "@/lib/astro-engine";
import { buildKundliChart, KundliEngineError } from "@/lib/kundli-engine";

/** Lets a member log a daily mood/note, tagged (when their birth profile is known) with which
 * house the transiting Moon occupied relative to their natal Moon at that moment — classical
 * Jyotish treats the Moon's transit house as the day-to-day emotional-tenor signifier, since it's
 * the fastest-moving graha (a new house roughly every ~2.25 days). Over enough entries this
 * surfaces real personal patterns instead of a generic "how are you feeling" log. */

export const MOODS = ["great", "good", "neutral", "low", "stressed"] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_LABELS: Record<Mood, string> = {
  great: "Great", good: "Good", neutral: "Neutral", low: "Low", stressed: "Stressed",
};

/** Moods grouped for correlation purposes — "great"/"good" as the positive pole, "low"/"stressed"
 * as the negative pole; "neutral" is excluded from both so it doesn't dilute either signal. */
const POSITIVE_MOODS = new Set<Mood>(["great", "good"]);
const NEGATIVE_MOODS = new Set<Mood>(["low", "stressed"]);

export type JournalEntry = {
  id: string;
  memberId: string;
  entryDate: string;
  mood: Mood;
  note: string;
  moonHouse: number | null;
  moonRashi: string | null;
  updatedAt: string;
};

type JournalEntryDoc = Omit<JournalEntry, "updatedAt"> & { updatedAt: Timestamp };

// Journal entries are calendar days for an India-based audience, not UTC days (same fix as
// streaks.ts) — without the IST offset, a member journaling between midnight and 5:30am IST gets
// "today" resolved as the previous UTC date, and since the doc id is memberId_entryDate (a plain
// upsert), that silently overwrites yesterday's entry instead of creating today's.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function todayIso() {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function relativeHouse(fromRashiIndex: number, toRashiIndex: number) {
  return ((toRashiIndex - fromRashiIndex + 12) % 12) + 1;
}

export async function logJournalEntry({ memberId, member, mood, note }: {
  memberId: string;
  member: { name: string; birthDate: string | null; birthTime: string | null; birthPlace: string | null };
  mood: Mood;
  note: string;
}): Promise<JournalEntry> {
  const entryDate = todayIso();
  let moonHouse: number | null = null;
  let moonRashi: string | null = null;

  if (member.birthDate && member.birthTime && member.birthPlace) {
    try {
      const chart = buildKundliChart({ name: member.name, birthDate: member.birthDate, birthTime: member.birthTime, birthPlace: member.birthPlace });
      const natalMoonRashiIndex = chart.positions.find((p) => p.graha === "moon")!.rashiIndex;
      const transitMoon = computeGrahaPositions(new Date()).find((p) => p.graha === "moon")!;
      moonHouse = relativeHouse(natalMoonRashiIndex, transitMoon.rashiIndex);
      moonRashi = RASHIS[transitMoon.rashiIndex].name;
    } catch (error) {
      if (!(error instanceof KundliEngineError)) throw error;
    }
  }

  const id = `${memberId}_${entryDate}`;
  const entry = { id, memberId, entryDate, mood, note: note.slice(0, 280), moonHouse, moonRashi };
  await db.collection("journalEntries").doc(id).set({ ...entry, updatedAt: FieldValue.serverTimestamp() });
  return { ...entry, updatedAt: new Date().toISOString() };
}

export async function listJournalEntries(memberId: string, limit = 30): Promise<JournalEntry[]> {
  const snap = await withIndexFallback(
    () => db.collection("journalEntries").where("memberId", "==", memberId).orderBy("entryDate", "desc").limit(limit).get(),
    { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as FirebaseFirestore.QuerySnapshot,
  );
  return snap.docs.map((doc) => {
    const data = doc.data() as JournalEntryDoc;
    return { ...data, updatedAt: (data.updatedAt?.toDate?.() ?? new Date()).toISOString() };
  });
}

export const HOUSE_LABELS: Record<number, string> = {
  1: "self & instincts", 2: "money & family", 3: "courage & communication", 4: "home & emotional comfort",
  5: "creativity & romance", 6: "work & daily friction", 7: "partnership", 8: "deep, private matters",
  9: "belief & the bigger picture", 10: "career & public life", 11: "gains & friendships", 12: "rest & release",
};

export type MoodInsight = { house: number; negativeShare: number; negativeCount: number; totalInHouse: number } | null;

const MIN_ENTRIES_FOR_INSIGHT = 5;
const MIN_HOUSE_SAMPLE = 3;

/** Finds the one house (if any) that's genuinely over-represented among low-mood entries —
 * deliberately conservative (needs a real sample in that house, not just one bad day) so this
 * doesn't manufacture a pattern out of noise. */
export function computeMoodInsight(entries: JournalEntry[]): MoodInsight {
  const tagged = entries.filter((entry) => entry.moonHouse !== null && (POSITIVE_MOODS.has(entry.mood) || NEGATIVE_MOODS.has(entry.mood)));
  if (tagged.length < MIN_ENTRIES_FOR_INSIGHT) return null;

  const byHouse = new Map<number, { negative: number; total: number }>();
  for (const entry of tagged) {
    const house = entry.moonHouse!;
    const bucket = byHouse.get(house) ?? { negative: 0, total: 0 };
    bucket.total += 1;
    if (NEGATIVE_MOODS.has(entry.mood)) bucket.negative += 1;
    byHouse.set(house, bucket);
  }

  const overallNegativeShare = tagged.filter((e) => NEGATIVE_MOODS.has(e.mood)).length / tagged.length;

  let best: MoodInsight = null;
  for (const [house, { negative, total }] of byHouse) {
    if (total < MIN_HOUSE_SAMPLE) continue;
    const share = negative / total;
    // Only surface a house whose negative-mood share meaningfully exceeds the member's own
    // baseline — otherwise every member would get a "pattern" purely from small-sample noise.
    if (share > overallNegativeShare + 0.25 && (!best || share > best.negativeShare)) {
      best = { house, negativeShare: share, negativeCount: negative, totalInHouse: total };
    }
  }
  return best;
}
