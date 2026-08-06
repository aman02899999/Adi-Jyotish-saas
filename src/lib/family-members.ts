import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { buildKundliChart, KundliEngineError, type KundliChart } from "@/lib/kundli-engine";
import { RASHIS, NAKSHATRAS } from "@/lib/astro-engine";

/** No competitor requires a separate login per family member just to see their chart. This lets a
 * member store a household's birth details under their own account and view each person's natal
 * chart snapshot on demand — reusing the same real chart engine as the member's own Kundli, with
 * nothing invented for family members specifically. */

export class FamilyMemberError extends Error {}

const MAX_FAMILY_MEMBERS = 12;

export type FamilyMember = {
  id: string;
  memberId: string;
  name: string;
  relationship: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  createdAt: string | null;
};

export type FamilyChartSnapshot = {
  ascendantRashi: string;
  moonRashi: string;
  moonNakshatra: string;
  sunRashi: string;
};

function familyCollection(memberId: string) {
  return db.collection("members").doc(memberId).collection("familyMembers");
}

function fromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): FamilyMember {
  const data = doc.data()!;
  return {
    id: doc.id,
    memberId: data.memberId,
    name: data.name,
    relationship: data.relationship ?? "",
    birthDate: data.birthDate,
    birthTime: data.birthTime,
    birthPlace: data.birthPlace,
    createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
  };
}

export async function listFamilyMembers(memberId: string): Promise<FamilyMember[]> {
  const snap = await familyCollection(memberId).orderBy("createdAt", "asc").get();
  return snap.docs.map(fromDoc);
}

export async function addFamilyMember({ memberId, name, relationship, birthDate, birthTime, birthPlace }: {
  memberId: string;
  name: string;
  relationship: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
}): Promise<FamilyMember> {
  if (!name.trim()) throw new FamilyMemberError("Please share their name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new FamilyMemberError("Please choose a valid birth date.");
  if (!/^\d{2}:\d{2}$/.test(birthTime)) throw new FamilyMemberError("Please enter a valid birth time.");
  if (!birthPlace.trim()) throw new FamilyMemberError("Please share their birth place.");

  const existing = await familyCollection(memberId).count().get();
  if (existing.data().count >= MAX_FAMILY_MEMBERS) {
    throw new FamilyMemberError(`You can link up to ${MAX_FAMILY_MEMBERS} family members.`);
  }

  // Validates the birth place resolves to real coordinates before saving, the same way the Kundli
  // matching tool does — fail fast with a friendly error rather than storing a chart that can
  // never actually be computed.
  try {
    buildKundliChart({ name: name.trim(), birthDate, birthTime, birthPlace: birthPlace.trim() });
  } catch (error) {
    if (error instanceof KundliEngineError) throw new FamilyMemberError(error.message);
    throw error;
  }

  const ref = await familyCollection(memberId).add({
    memberId,
    name: name.trim().slice(0, 120),
    relationship: relationship.trim().slice(0, 60),
    birthDate,
    birthTime,
    birthPlace: birthPlace.trim().slice(0, 160),
    createdAt: FieldValue.serverTimestamp(),
  });
  const saved = await ref.get();
  return fromDoc(saved);
}

export async function deleteFamilyMember(memberId: string, familyMemberId: string): Promise<void> {
  await familyCollection(memberId).doc(familyMemberId).delete();
}

export function chartSnapshot(chart: KundliChart): FamilyChartSnapshot {
  const moon = chart.positions.find((p) => p.graha === "moon")!;
  const sun = chart.positions.find((p) => p.graha === "sun")!;
  return {
    ascendantRashi: RASHIS[chart.ascendantRashiIndex].name,
    moonRashi: RASHIS[moon.rashiIndex].name,
    moonNakshatra: NAKSHATRAS[moon.nakshatraIndex],
    sunRashi: RASHIS[sun.rashiIndex].name,
  };
}

export function buildFamilyChart(familyMember: FamilyMember) {
  return buildKundliChart({ name: familyMember.name, birthDate: familyMember.birthDate, birthTime: familyMember.birthTime, birthPlace: familyMember.birthPlace });
}
