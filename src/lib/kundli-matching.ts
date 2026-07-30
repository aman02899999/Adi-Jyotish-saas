import "server-only";

import { db } from "@/db";
import { kundliMatches } from "@/db/schema";
import { getKundliMatchingText } from "@/lib/gemini";

export class KundliMatchError extends Error {}

export async function createKundliMatch({ memberId, nameA, birthDateA, nameB, birthDateB }: {
  memberId: number | null;
  nameA: string;
  birthDateA: string;
  nameB: string;
  birthDateB: string;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateA) || !/^\d{4}-\d{2}-\d{2}$/.test(birthDateB)) {
    throw new KundliMatchError("Please enter valid birth dates for both people.");
  }

  const { score, narrative } = await getKundliMatchingText({ nameA, birthDateA, nameB, birthDateB });

  const [saved] = await db.insert(kundliMatches).values({
    memberId,
    personAName: nameA,
    personABirthDate: birthDateA,
    personBName: nameB,
    personBBirthDate: birthDateB,
    compatibilityScore: score,
    narrative,
  }).returning();
  return saved;
}
