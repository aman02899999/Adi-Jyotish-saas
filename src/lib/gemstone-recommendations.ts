import "server-only";

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { gemstoneProducts, gemstoneRecommendations } from "@/db/schema";
import { getGemstoneRecommendationText, isGeminiConfigured } from "@/lib/gemini";
import { getProductCatalog, type ProductListItem } from "@/lib/gemstones";
import { signForBirthDate, ZODIAC_SIGNS } from "@/lib/horoscopes";

export class RecommendationError extends Error {}

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

export async function createGemstoneRecommendation({ memberId, name, birthDate, concern }: {
  memberId: number | null;
  name: string;
  birthDate: string;
  concern: string;
}) {
  const sign = signForBirthDate(birthDate);
  if (!sign) throw new RecommendationError("Please enter a valid birth date.");
  if (!isGeminiConfigured()) throw new RecommendationError("Gemstone recommendations are not configured yet. Please try again shortly.");

  const definition = ZODIAC_SIGNS.find((entry) => entry.key === sign)!;
  const matches = await getMatchingProducts(definition.name);

  const planetByProductId = matches.length
    ? new Map((await db.select({ id: gemstoneProducts.id, recommendedPlanets: gemstoneProducts.recommendedPlanets }).from(gemstoneProducts).where(inArray(gemstoneProducts.id, matches.map((item) => item.id)))).map((row) => [row.id, row.recommendedPlanets]))
    : new Map<number, string>();

  const narrative = await getGemstoneRecommendationText({
    name,
    signName: definition.name,
    concern,
    gemstones: matches.map((item) => ({ name: item.name, planet: planetByProductId.get(item.id) || "your ruling planet", description: item.shortDescription })),
  });

  const [saved] = await db.insert(gemstoneRecommendations).values({
    memberId,
    name,
    birthDate,
    concern: concern || null,
    zodiacSign: sign,
    categorySlugs: matches.map((item) => item.categorySlug).join(","),
    narrative,
  }).returning();

  return { recommendation: saved, sign: definition, products: matches };
}
