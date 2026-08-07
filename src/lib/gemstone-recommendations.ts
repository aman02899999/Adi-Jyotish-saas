import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getProductCatalog, type ProductListItem } from "@/lib/gemstones";
import { signForBirthDate, ZODIAC_SIGNS, type ZodiacSignKey } from "@/lib/horoscopes";

export class RecommendationError extends Error {}

const recommendationsCol = db.collection("gemstoneRecommendations");
const productsCol = db.collection("gemstoneProducts");

export type GemstoneRecommendation = {
  id: string;
  memberId: string | null;
  name: string;
  birthDate: string;
  concern: string | null;
  zodiacSign: string;
  categorySlugs: string;
  narrative: string;
  createdAt: Date;
};

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function fromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): GemstoneRecommendation {
  const data = doc.data() as Omit<GemstoneRecommendation, "id" | "createdAt"> & { createdAt?: Timestamp };
  return { ...data, id: doc.id, createdAt: toDate(data.createdAt) };
}

const RULING_PLANET: Record<ZodiacSignKey, string> = {
  aries: "Mars", taurus: "Venus", gemini: "Mercury", cancer: "Moon", leo: "Sun", virgo: "Mercury",
  libra: "Venus", scorpio: "Mars", sagittarius: "Jupiter", capricorn: "Saturn", aquarius: "Saturn", pisces: "Jupiter",
};

const CLASSICAL_STONE: Record<string, string> = {
  Sun: "Ruby", Moon: "Pearl", Mars: "Red Coral", Mercury: "Emerald", Jupiter: "Yellow Sapphire", Venus: "Diamond", Saturn: "Blue Sapphire",
};

async function getMatchingProducts(signName: string): Promise<ProductListItem[]> {
  const { items } = await getProductCatalog({ zodiac: signName, pageSize: 24, sort: "rating" });
  const seenCategories = new Set<string>();
  const matches: ProductListItem[] = [];
  for (const item of items) {
    if (seenCategories.has(item.categorySlug)) continue;
    seenCategories.add(item.categorySlug);
    matches.push(item);
    if (matches.length === 3) break;
  }
  return matches;
}

function buildNarrative({ name, signKey, concern, gemstones }: {
  name: string; signKey: ZodiacSignKey; concern: string;
  gemstones: Array<{ name: string; planet: string; description: string; slug: string }>;
}) {
  const rulingPlanet = RULING_PLANET[signKey];
  const signLabel = ZODIAC_SIGNS.find((entry) => entry.key === signKey)!.name;
  const concernLine = concern ? ` You mentioned: "${concern}."` : "";

  if (!gemstones.length) {
    const classical = CLASSICAL_STONE[rulingPlanet] ?? "a stone suited to your ruling planet";
    return [
      `${name}, ${signLabel} is ruled by ${rulingPlanet}.${concernLine} Classically, ${rulingPlanet} is associated with ${classical} — it isn't currently in our collection, so we can't recommend a specific piece from our catalog today.`,
      `Gemstone selection is genuinely personal — the right weight, metal setting, and even whether a stone suits you at all depends on your full birth chart, not just your sign. A consultation with one of our practitioners will give you guidance grounded in your actual chart rather than a general sign-based guess.`,
    ].join("\n\n");
  }

  const list = gemstones.map((gem) => `${gem.name} (ruled by ${gem.planet}) — ${gem.description}`).join("; ");
  return [
    `${name}, ${signLabel} is ruled by ${rulingPlanet}.${concernLine} From our collection, these stones are classically suited to your sign: ${list}.`,
    `A gemstone works with your chart, not against it — before wearing one regularly, it's worth confirming the right weight and metal setting with a practitioner, especially if you're wearing it for a specific concern rather than general wellbeing.`,
  ].join("\n\n");
}

export async function createGemstoneRecommendation({ memberId, name, birthDate, concern }: {
  memberId: string | null;
  name: string;
  birthDate: string;
  concern: string;
}) {
  const sign = signForBirthDate(birthDate);
  if (!sign) throw new RecommendationError("Please enter a valid birth date.");

  const definition = ZODIAC_SIGNS.find((entry) => entry.key === sign)!;
  const matches = await getMatchingProducts(definition.name);

  const planetByProductId = new Map<string, string>();
  if (matches.length) {
    const snaps = await db.getAll(...matches.map((item) => productsCol.doc(item.id)));
    for (const snap of snaps) {
      if (snap.exists) planetByProductId.set(snap.id, (snap.data()?.recommendedPlanets as string | undefined) ?? "");
    }
  }

  const narrative = buildNarrative({
    name, signKey: sign, concern,
    gemstones: matches.map((item) => ({ name: item.name, planet: planetByProductId.get(item.id) || RULING_PLANET[sign], description: item.shortDescription, slug: item.slug })),
  });

  const ref = recommendationsCol.doc();
  await ref.set({
    memberId,
    name,
    birthDate,
    concern: concern || null,
    zodiacSign: sign,
    categorySlugs: matches.map((item) => item.categorySlug).join(","),
    narrative,
    createdAt: FieldValue.serverTimestamp(),
  });
  const saved = fromDoc(await ref.get());

  return { recommendation: saved, sign: definition, products: matches };
}
