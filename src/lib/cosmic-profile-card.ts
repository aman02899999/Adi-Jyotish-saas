import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { buildKundliChart } from "@/lib/kundli-engine";
import { RASHIS, type GrahaKey } from "@/lib/astro-engine";

/** Classical rulership of each rashi (Mesha..Meena) by its lord — Rahu/Ketu rule none. */
const RASHI_LORDS: GrahaKey[] = [
  "mars", "venus", "mercury", "moon", "sun", "mercury",
  "venus", "mars", "jupiter", "saturn", "saturn", "jupiter",
];

/** One-line personality read keyed by the Lagna (rising sign) lord — the classical Jyotish
 * signifier for how a person meets the world, so this is a real astrological derivation
 * rather than an invented "dominant planet" concept. */
const LAGNA_LORD_BLURB: Partial<Record<GrahaKey, string>> = {
  sun: "A natural-born leader with a magnetic, confident presence.",
  moon: "Deeply intuitive — you feel your way through life before you think it through.",
  mars: "Driven, courageous, and quick to act on what you believe in.",
  mercury: "Sharp-witted, curious, and endlessly adaptable.",
  jupiter: "Wise, generous, and drawn to growth in everything you do.",
  venus: "A lover of beauty, harmony, and meaningful connection.",
  saturn: "Disciplined and patient — built for the long game.",
};

export type CosmicProfileCard = {
  memberId: string;
  name: string;
  sunRashi: string;
  moonRashi: string;
  risingRashi: string;
  lagnaLord: GrahaKey;
  blurb: string;
  updatedAt: string;
};

type CosmicProfileCardDoc = Omit<CosmicProfileCard, "updatedAt"> & { updatedAt: Timestamp };

export async function upsertCosmicProfileCard({ memberId, name, birthDate, birthTime, birthPlace }: {
  memberId: string; name: string; birthDate: string; birthTime: string; birthPlace: string;
}): Promise<CosmicProfileCard> {
  const chart = buildKundliChart({ name, birthDate, birthTime, birthPlace });
  const sun = chart.positions.find((position) => position.graha === "sun")!;
  const moon = chart.positions.find((position) => position.graha === "moon")!;
  const lagnaLord = RASHI_LORDS[chart.ascendantRashiIndex];

  const card = {
    memberId,
    name,
    sunRashi: RASHIS[sun.rashiIndex].name,
    moonRashi: RASHIS[moon.rashiIndex].name,
    risingRashi: RASHIS[chart.ascendantRashiIndex].name,
    lagnaLord,
    blurb: LAGNA_LORD_BLURB[lagnaLord]!,
  };

  await db.collection("cosmicProfileCards").doc(memberId).set({ ...card, updatedAt: FieldValue.serverTimestamp() });
  return { ...card, updatedAt: new Date().toISOString() };
}

export async function getCosmicProfileCard(memberId: string): Promise<CosmicProfileCard | null> {
  const snap = await db.collection("cosmicProfileCards").doc(memberId).get();
  if (!snap.exists) return null;
  const data = snap.data() as CosmicProfileCardDoc;
  return { ...data, updatedAt: (data.updatedAt?.toDate?.() ?? new Date()).toISOString() };
}
