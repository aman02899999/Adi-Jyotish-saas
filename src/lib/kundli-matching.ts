import "server-only";

import { db } from "@/db";
import { kundliMatches } from "@/db/schema";
import { computeAshtakoot, type AshtakootResult } from "@/lib/ashtakoot";
import { computeGrahaPositions, NAKSHATRAS, RASHIS } from "@/lib/astro-engine";
import { PlaceNotFoundError, resolveBirthMoment } from "@/lib/geo";

export class KundliMatchError extends Error {}

function moonPlacement(utcInstant: Date) {
  const moon = computeGrahaPositions(utcInstant).find((position) => position.graha === "moon")!;
  return { rashiIndex: moon.rashiIndex, nakshatraIndex: moon.nakshatraIndex };
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

  paragraphs.push(tier.guidance);
  paragraphs.push("Guna Milan is one traditional input among many — it's not a substitute for the couple's own compatibility, values, and communication.");

  return paragraphs.join("\n\n");
}

export async function createKundliMatch({ memberId, nameA, birthDateA, birthTimeA, birthPlaceA, nameB, birthDateB, birthTimeB, birthPlaceB }: {
  memberId: number | null;
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
  });

  const narrative = buildNarrative({ nameA, nameB, result });

  const [saved] = await db.insert(kundliMatches).values({
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
  }).returning();

  return {
    match: saved,
    result,
    moonARashi: RASHIS[moonA.rashiIndex].name,
    moonANakshatra: NAKSHATRAS[moonA.nakshatraIndex],
    moonBRashi: RASHIS[moonB.rashiIndex].name,
    moonBNakshatra: NAKSHATRAS[moonB.nakshatraIndex],
  };
}
