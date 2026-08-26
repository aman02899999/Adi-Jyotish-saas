import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { computeAshtakoot, type AshtakootResult } from "@/lib/ashtakoot";
import { computeGrahaPositions, NAKSHATRAS, RASHIS } from "@/lib/astro-engine";
import { computeCompatibilityTimeline, type TimelineMonth } from "@/lib/compatibility-timeline";
import { PlaceNotFoundError, resolveBirthMoment } from "@/lib/geo";

export class KundliMatchError extends Error {}

function moonPlacement(utcInstant: Date) {
  const moon = computeGrahaPositions(utcInstant).find((position) => position.graha === "moon")!;
  return { rashiIndex: moon.rashiIndex, nakshatraIndex: moon.nakshatraIndex, pada: moon.pada };
}

function scoreTier(score: number) {
  if (score >= 28) return { label: "an excellent match", guidance: "This pairing scores strongly across nearly every koota — classical Jyotish considers this a very supportive foundation for a lasting marriage." };
  if (score >= 21) return { label: "a good match", guidance: "This is comfortably above the traditional minimum of 18 points, with real strengths outweighing the friction points noted below." };
  if (score >= 18) return { label: "a workable match", guidance: "This sits at or just above the traditional 18-point minimum. Many marriages proceed successfully from here, especially once the specific weak points below are understood and, where relevant, addressed with a priest's guidance." };
  return { label: "a match with real differences", guidance: "This falls below the traditional 18-point minimum. That doesn't mean incompatibility — it means the friction points below deserve honest discussion, and many families choose to consult a priest about remedial measures before proceeding." };
}

const KOOTA_INFO: Record<keyof AshtakootResult["breakdown"], { name: string; max: number; about: string }> = {
  varna: { name: "Varna", max: 1, about: "spiritual temperament and ego" },
  vashya: { name: "Vashya", max: 2, about: "mutual influence and control in the relationship" },
  tara: { name: "Tara", max: 3, about: "general wellbeing and destiny alignment" },
  yoni: { name: "Yoni", max: 4, about: "physical and intimate compatibility" },
  grahaMaitri: { name: "Graha Maitri", max: 5, about: "mental compatibility and intellectual rapport" },
  gana: { name: "Gana", max: 6, about: "basic temperament and nature" },
  bhakoot: { name: "Bhakoot", max: 7, about: "emotional bond and financial prosperity" },
  nadi: { name: "Nadi", max: 8, about: "health, genetics, and progeny" },
};

function buildNarrative({ nameA, nameB, result }: { nameA: string; nameB: string; result: AshtakootResult }) {
  const tier = scoreTier(result.totalScore);
  const paragraphs: string[] = [];

  paragraphs.push(`${nameA} and ${nameB} score ${result.totalScore} out of 36 on the classical Ashtakoot Guna Milan scale — ${tier.label}. ${nameA}'s Moon is in ${result.brideRashiName}; ${nameB}'s Moon is in ${result.groomRashiName}.`);

  const entries = Object.entries(result.breakdown) as Array<[keyof AshtakootResult["breakdown"], number]>;
  const strongKootas = entries.filter(([key, value]) => value === KOOTA_INFO[key].max).map(([key]) => KOOTA_INFO[key].name);
  const weakEntries = entries.filter(([, value]) => value === 0);
  const weakKootas = weakEntries.map(([key]) => KOOTA_INFO[key].name);
  // A koota can score 0 mechanically but still not count as a real dosha — classical texts
  // recognize specific exceptions (same nakshatra different pada for Nadi; matching rashi lords
  // for Bhakoot) that cancel the concern without changing the raw point total.
  const nadiExempt = result.breakdown.nadi === 0 && !result.nadiDosha;
  const bhakootExempt = result.breakdown.bhakoot === 0 && !result.bhakootDosha;

  if (strongKootas.length) {
    const aboutList = entries.filter(([key, value]) => value === KOOTA_INFO[key].max).map(([key]) => KOOTA_INFO[key].about).join("; ");
    paragraphs.push(`Full points landed on ${strongKootas.join(", ")} — strong ground on ${aboutList}.`);
  }

  if (weakKootas.length) {
    const doshaNote = result.nadiDosha
      ? " — the Nadi match in particular is the koota classical texts weigh most heavily, worth discussing with a priest"
      : result.bhakootDosha ? " — the Bhakoot mismatch is worth discussing with a priest" : "";
    paragraphs.push(`The weaker points were ${weakKootas.join(", ")}${doshaNote}.`);
  } else {
    paragraphs.push("No koota scored zero — there's no single classical dosha standing out here.");
  }

  if (nadiExempt) paragraphs.push("The Nadi koota scored zero mechanically, but classical texts exempt this specific case — same nakshatra, different pada — from being treated as a real dosha.");
  if (bhakootExempt) paragraphs.push("The Bhakoot koota scored zero mechanically, but classical texts exempt this specific case — both Moon signs share the same ruling planet — from being treated as a real dosha.");

  paragraphs.push(tier.guidance);
  paragraphs.push("Guna Milan is one traditional input among many — it's not a substitute for the couple's own compatibility, values, and communication.");

  return paragraphs.join("\n\n");
}

export async function createKundliMatch({ memberId, nameA, birthDateA, birthTimeA, birthPlaceA, nameB, birthDateB, birthTimeB, birthPlaceB }: {
  memberId: string | null;
  nameA: string;
  birthDateA: string;
  birthTimeA: string;
  birthPlaceA: string;
  nameB: string;
  birthDateB: string;
  birthTimeB: string;
  birthPlaceB: string;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateA) || !/^\d{4}-\d{2}-\d{2}$/.test(birthDateB)) {
    throw new KundliMatchError("Please enter valid birth dates for both people.");
  }
  if (!/^\d{2}:\d{2}$/.test(birthTimeA) || !/^\d{2}:\d{2}$/.test(birthTimeB)) {
    throw new KundliMatchError("Please enter valid birth times for both people.");
  }

  let momentA: ReturnType<typeof resolveBirthMoment>;
  let momentB: ReturnType<typeof resolveBirthMoment>;
  try {
    momentA = resolveBirthMoment({ birthDate: birthDateA, birthTime: birthTimeA, birthPlace: birthPlaceA });
    momentB = resolveBirthMoment({ birthDate: birthDateB, birthTime: birthTimeB, birthPlace: birthPlaceB });
  } catch (error) {
    if (error instanceof PlaceNotFoundError) throw new KundliMatchError(error.message);
    throw error;
  }

  const moonA = moonPlacement(momentA.utcInstant);
  const moonB = moonPlacement(momentB.utcInstant);

  const result = computeAshtakoot({
    brideMoonRashi: moonA.rashiIndex,
    brideMoonNakshatra: moonA.nakshatraIndex,
    groomMoonRashi: moonB.rashiIndex,
    groomMoonNakshatra: moonB.nakshatraIndex,
    bridePada: moonA.pada,
    groomPada: moonB.pada,
  });

  const narrative = buildNarrative({ nameA, nameB, result });
  const timeline = computeCompatibilityTimeline({ nameA, moonARashiIndex: moonA.rashiIndex, nameB, moonBRashiIndex: moonB.rashiIndex });

  const ref = await db.collection("kundliMatches").add({
    memberId,
    personAName: nameA,
    personABirthDate: birthDateA,
    personABirthTime: birthTimeA,
    personABirthPlace: birthPlaceA,
    personBName: nameB,
    personBBirthDate: birthDateB,
    personBBirthTime: birthTimeB,
    personBBirthPlace: birthPlaceB,
    compatibilityScore: result.totalScore,
    breakdown: result.breakdown,
    narrative,
    timeline,
    createdAt: FieldValue.serverTimestamp(),
  });
  const saved = { id: ref.id, memberId, personAName: nameA, personABirthDate: birthDateA, personABirthTime: birthTimeA, personABirthPlace: birthPlaceA, personBName: nameB, personBBirthDate: birthDateB, personBBirthTime: birthTimeB, personBBirthPlace: birthPlaceB, compatibilityScore: result.totalScore, breakdown: result.breakdown, narrative, timeline };

  return {
    match: saved,
    result,
    moonARashi: RASHIS[moonA.rashiIndex].name,
    moonANakshatra: NAKSHATRAS[moonA.nakshatraIndex],
    moonBRashi: RASHIS[moonB.rashiIndex].name,
    moonBNakshatra: NAKSHATRAS[moonB.nakshatraIndex],
    timeline: timeline as TimelineMonth[],
  };
}

export type KundliMatchRecord = {
  id: string;
  nameA: string; birthDateA: string; birthTimeA: string; birthPlaceA: string;
  nameB: string; birthDateB: string; birthTimeB: string; birthPlaceB: string;
  narrative: string;
  timeline: TimelineMonth[];
};

/** Owner-scoped fetch of a saved match, for the PDF download route — unlike
 * getShareableKundliMatch (deliberately public and birth-detail-free for the social share
 * card), this returns full birth details, so it's gated to the member who created the match.
 * Anonymous matches (memberId null) have no owner to check against and can never be fetched
 * here, matching how every other paid/personal PDF in this codebase is scoped.
 * Ashtakoot recomputed fresh from the stored birth data rather than trusting cached derived
 * fields — consistent with this app's deterministic-and-reproducible philosophy, and avoids
 * needing a schema migration since the moon-placement labels were never persisted. */
export async function getKundliMatchById(id: string, memberId: string): Promise<{
  record: KundliMatchRecord;
  result: AshtakootResult;
  moonARashi: string; moonANakshatra: string; moonBRashi: string; moonBNakshatra: string;
} | null> {
  const snap = await db.collection("kundliMatches").doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as {
    memberId: string | null;
    personAName: string; personABirthDate: string; personABirthTime: string; personABirthPlace: string;
    personBName: string; personBBirthDate: string; personBBirthTime: string; personBBirthPlace: string;
    narrative: string; timeline: TimelineMonth[];
  };
  if (!data.memberId || data.memberId !== memberId) return null;

  let momentA: ReturnType<typeof resolveBirthMoment>;
  let momentB: ReturnType<typeof resolveBirthMoment>;
  try {
    momentA = resolveBirthMoment({ birthDate: data.personABirthDate, birthTime: data.personABirthTime, birthPlace: data.personABirthPlace });
    momentB = resolveBirthMoment({ birthDate: data.personBBirthDate, birthTime: data.personBBirthTime, birthPlace: data.personBBirthPlace });
  } catch (error) {
    if (error instanceof PlaceNotFoundError) throw new KundliMatchError(error.message);
    throw error;
  }
  const moonA = moonPlacement(momentA.utcInstant);
  const moonB = moonPlacement(momentB.utcInstant);
  const result = computeAshtakoot({
    brideMoonRashi: moonA.rashiIndex, brideMoonNakshatra: moonA.nakshatraIndex,
    groomMoonRashi: moonB.rashiIndex, groomMoonNakshatra: moonB.nakshatraIndex,
    bridePada: moonA.pada, groomPada: moonB.pada,
  });

  return {
    record: {
      id: snap.id,
      nameA: data.personAName, birthDateA: data.personABirthDate, birthTimeA: data.personABirthTime, birthPlaceA: data.personABirthPlace,
      nameB: data.personBName, birthDateB: data.personBBirthDate, birthTimeB: data.personBBirthTime, birthPlaceB: data.personBBirthPlace,
      narrative: data.narrative, timeline: data.timeline,
    },
    result,
    moonARashi: RASHIS[moonA.rashiIndex].name, moonANakshatra: NAKSHATRAS[moonA.nakshatraIndex],
    moonBRashi: RASHIS[moonB.rashiIndex].name, moonBNakshatra: NAKSHATRAS[moonB.nakshatraIndex],
  };
}

export { scoreTier };

/** Public, share-safe summary of a saved match — deliberately omits birth date/time/place,
 * which the full match document stores but a shared social card should never expose. */
export type ShareableKundliMatch = { id: string; nameA: string; nameB: string; score: number; maxScore: number; tierLabel: string };

export async function getShareableKundliMatch(id: string): Promise<ShareableKundliMatch | null> {
  const snap = await db.collection("kundliMatches").doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as { personAName: string; personBName: string; compatibilityScore: number };
  return {
    id,
    nameA: data.personAName,
    nameB: data.personBName,
    score: data.compatibilityScore,
    maxScore: 36,
    tierLabel: scoreTier(data.compatibilityScore).label,
  };
}
