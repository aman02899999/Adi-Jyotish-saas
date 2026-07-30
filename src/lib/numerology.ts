import "server-only";

import { db } from "@/db";
import { numerologyReadings } from "@/db/schema";
import { getNumerologyText } from "@/lib/gemini";

export class NumerologyError extends Error {}

function reduceNumber(value: number) {
  let current = value;
  while (current > 9 && current !== 11 && current !== 22 && current !== 33) {
    current = String(current).split("").reduce((sum, digit) => sum + Number(digit), 0);
  }
  return current;
}

export function computeLifePathNumber(birthDate: string) {
  const digits = birthDate.replace(/\D/g, "");
  const sum = digits.split("").reduce((total, digit) => total + Number(digit), 0);
  return reduceNumber(sum);
}

export function computeDestinyNumber(name: string) {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  const sum = letters.split("").reduce((total, letter) => total + (((letter.charCodeAt(0) - 65) % 9) + 1), 0);
  return reduceNumber(sum || 1);
}

export async function createNumerologyReading({ memberId, name, birthDate }: { memberId: number | null; name: string; birthDate: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new NumerologyError("Please enter a valid birth date.");
  const lifePathNumber = computeLifePathNumber(birthDate);
  const destinyNumber = computeDestinyNumber(name);

  const narrative = await getNumerologyText({ name, birthDate, lifePathNumber, destinyNumber });

  const [saved] = await db.insert(numerologyReadings).values({ memberId, name, birthDate, lifePathNumber, destinyNumber, narrative }).returning();
  return saved;
}
