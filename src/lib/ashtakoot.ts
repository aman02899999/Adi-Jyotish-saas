import "server-only";

/**
 * Ashtakoot Guna Milan — the classical 8-koota Vedic compatibility system (max 36 points),
 * computed from the real sidereal Moon Rashi/Nakshatra of both people (see astro-engine.ts).
 * No AI — every koota is a documented, mechanical rule from classical Jyotish. Where a
 * classical rule has a well-known simplified/symmetric variant used by most calculators
 * (Vashya, Gana), that simplification is called out explicitly rather than guessed at.
 */

const RASHI_NAMES = ["Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya", "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena"] as const;

// --- Varna (max 1) — rashi grouped by element, ranked Brahmin(0, highest) > Kshatriya(1) > Vaishya(2) > Shudra(3, lowest). ---
const VARNA_RANK = [1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0]; // index = rashiIndex (Mesha..Meena)

function varnaPoints(brideRashi: number, groomRashi: number) {
  return VARNA_RANK[groomRashi] <= VARNA_RANK[brideRashi] ? 1 : 0;
}

// --- Vashya (max 2) — 5 classical groups. Simplified whole-sign version (no half-sign
// splits for Dhanu/Makara), same as most kundli-matching calculators: full points only for
// an exact group match. ---
const VASHYA_GROUP = ["chatushpada", "chatushpada", "manava", "jalachara", "vanachara", "manava", "manava", "keeta", "chatushpada", "jalachara", "manava", "jalachara"] as const;

function vashyaPoints(brideRashi: number, groomRashi: number) {
  return VASHYA_GROUP[brideRashi] === VASHYA_GROUP[groomRashi] ? 2 : 0;
}

// --- Tara (max 3) — the 9-star cycle counted both directions from each person's nakshatra.
// Counts landing on Vipat(3), Pratyak(5), or Vadha(7) in the 1-9 cycle are inauspicious. ---
const TARA_UNFAVORABLE = new Set([3, 5, 7]);

function taraFavorable(fromNakshatra: number, toNakshatra: number) {
  const count = ((toNakshatra - fromNakshatra + 27) % 27) + 1;
  const group = ((count - 1) % 9) + 1;
  return !TARA_UNFAVORABLE.has(group);
}

function taraPoints(brideNakshatra: number, groomNakshatra: number) {
  const brideToGroom = taraFavorable(brideNakshatra, groomNakshatra);
  const groomToBride = taraFavorable(groomNakshatra, brideNakshatra);
  if (brideToGroom && groomToBride) return 3;
  if (brideToGroom || groomToBride) return 1.5;
  return 0;
}

// --- Yoni (max 4) — nakshatra → one of 14 classical animal symbols. ---
const YONI_ANIMALS = [
  "Horse", "Elephant", "Goat", "Serpent", "Serpent", "Dog", "Cat", "Goat", "Cat", "Rat", "Rat", "Cow", "Buffalo",
  "Tiger", "Buffalo", "Tiger", "Deer", "Deer", "Dog", "Monkey", "Mongoose", "Monkey", "Lion", "Horse", "Lion", "Cow", "Elephant",
] as const;

const YONI_ENEMIES: Record<string, string> = {
  Horse: "Buffalo", Buffalo: "Horse",
  Elephant: "Lion", Lion: "Elephant",
  Goat: "Monkey", Monkey: "Goat",
  Serpent: "Mongoose", Mongoose: "Serpent",
  Dog: "Deer", Deer: "Dog",
  Cat: "Rat", Rat: "Cat",
  Cow: "Tiger", Tiger: "Cow",
};

function yoniPoints(brideNakshatra: number, groomNakshatra: number) {
  const brideAnimal = YONI_ANIMALS[brideNakshatra];
  const groomAnimal = YONI_ANIMALS[groomNakshatra];
  if (brideAnimal === groomAnimal) return 4;
  if (YONI_ENEMIES[brideAnimal] === groomAnimal) return 0;
  return 2;
}

// --- Graha Maitri (max 5) — natural (naisargika) friendship between the two Moon-sign lords. ---
const RASHI_LORD = ["mars", "venus", "mercury", "moon", "sun", "mercury", "venus", "mars", "jupiter", "saturn", "saturn", "jupiter"] as const;

const NATURAL_FRIENDS: Record<string, string[]> = {
  sun: ["moon", "mars", "jupiter"],
  moon: ["sun", "mercury"],
  mars: ["sun", "moon", "jupiter"],
  mercury: ["sun", "venus"],
  jupiter: ["sun", "moon", "mars"],
  venus: ["mercury", "saturn"],
  saturn: ["mercury", "venus"],
};
const NATURAL_ENEMIES: Record<string, string[]> = {
  sun: ["venus", "saturn"],
  moon: [],
  mars: ["mercury"],
  mercury: ["moon"],
  jupiter: ["mercury", "venus"],
  venus: ["sun", "moon"],
  saturn: ["sun", "moon", "mars"],
};

function relation(from: string, to: string) {
  if (from === to) return "self";
  if (NATURAL_FRIENDS[from]?.includes(to)) return "friend";
  if (NATURAL_ENEMIES[from]?.includes(to)) return "enemy";
  return "neutral";
}

function grahaMaitriPoints(brideRashi: number, groomRashi: number) {
  const brideLord = RASHI_LORD[brideRashi];
  const groomLord = RASHI_LORD[groomRashi];
  if (brideLord === groomLord) return 5;
  const a = relation(brideLord, groomLord);
  const b = relation(groomLord, brideLord);
  const pair = [a, b].sort().join("-");
  if (pair === "friend-friend") return 5;
  if (pair === "friend-neutral") return 4;
  if (pair === "neutral-neutral") return 3;
  if (pair === "enemy-friend") return 1;
  if (pair === "enemy-neutral") return 0.5;
  return 0; // enemy-enemy
}

// --- Gana (max 6) — nakshatra temperament: Deva (divine), Manushya (human), Rakshasa (demonic). ---
const GANA = [
  "deva", "manushya", "rakshasa", "manushya", "deva", "manushya", "deva", "deva", "rakshasa",
  "rakshasa", "manushya", "manushya", "deva", "rakshasa", "deva", "rakshasa", "deva", "rakshasa",
  "rakshasa", "manushya", "manushya", "deva", "rakshasa", "rakshasa", "manushya", "manushya", "deva",
] as const;

function ganaPoints(brideNakshatra: number, groomNakshatra: number) {
  const brideGana = GANA[brideNakshatra];
  const groomGana = GANA[groomNakshatra];
  if (brideGana === groomGana) return 6;
  if (brideGana === "rakshasa" || groomGana === "rakshasa") return 0;
  return 6; // deva-manushya: treated as fully compatible (simplified symmetric rule)
}

// --- Bhakoot (max 7) — rashi distance between the two Moon signs. The 2-12, 5-9, and 6-8
// relationships are Bhakoot Dosha (0 points); every other distance gets full points. ---
const BHAKOOT_DOSHA_DISTANCES = new Set([2, 5, 6, 8, 9, 12]);

function bhakootPoints(brideRashi: number, groomRashi: number) {
  const distance = ((groomRashi - brideRashi + 12) % 12) + 1;
  return BHAKOOT_DOSHA_DISTANCES.has(distance) ? 0 : 7;
}

// --- Nadi (max 8) — nakshatra grouped into Aadi/Madhya/Antya. Same Nadi is the most
// significant classical dosha and scores 0; different Nadi scores full points. ---
const NADI = [
  "aadi", "madhya", "antya", "antya", "madhya", "aadi", "aadi", "madhya", "antya",
  "antya", "madhya", "aadi", "aadi", "madhya", "antya", "antya", "madhya", "aadi",
  "aadi", "madhya", "antya", "antya", "madhya", "aadi", "aadi", "madhya", "antya",
] as const;

function nadiPoints(brideNakshatra: number, groomNakshatra: number) {
  return NADI[brideNakshatra] === NADI[groomNakshatra] ? 0 : 8;
}

// The single most consistently-cited classical exception (parihara) for Nadi dosha: when both
// people share the exact same nakshatra but land in a different pada (quarter), the dosha is
// considered cancelled — it isn't the "same Nadi group from two different stars" case the dosha
// is meant to flag. This doesn't change the mechanical 0/8 score (still the traditional 36-point
// scale), only whether it's narrated to the couple as a real concern.
function nadiDoshaCancelled(brideNakshatra: number, groomNakshatra: number, bridePada: number, groomPada: number) {
  return brideNakshatra === groomNakshatra && bridePada !== groomPada;
}

// The most consistently-cited classical exception for Bhakoot dosha: when both Moon signs share
// the same ruling planet, the dosha is considered cancelled. Same caveat as above — the score
// itself is unchanged, only the interpretation.
function bhakootDoshaCancelled(brideRashi: number, groomRashi: number) {
  return RASHI_LORD[brideRashi] === RASHI_LORD[groomRashi];
}

export type AshtakootBreakdown = {
  varna: number; vashya: number; tara: number; yoni: number;
  grahaMaitri: number; gana: number; bhakoot: number; nadi: number;
};

export type AshtakootResult = {
  totalScore: number;
  maxScore: 36;
  breakdown: AshtakootBreakdown;
  nadiDosha: boolean;
  bhakootDosha: boolean;
  brideRashiName: string;
  groomRashiName: string;
};

export function computeAshtakoot({ brideMoonRashi, brideMoonNakshatra, groomMoonRashi, groomMoonNakshatra, bridePada, groomPada }: {
  brideMoonRashi: number;
  brideMoonNakshatra: number;
  groomMoonRashi: number;
  groomMoonNakshatra: number;
  bridePada?: number;
  groomPada?: number;
}): AshtakootResult {
  const breakdown: AshtakootBreakdown = {
    varna: varnaPoints(brideMoonRashi, groomMoonRashi),
    vashya: vashyaPoints(brideMoonRashi, groomMoonRashi),
    tara: taraPoints(brideMoonNakshatra, groomMoonNakshatra),
    yoni: yoniPoints(brideMoonNakshatra, groomMoonNakshatra),
    grahaMaitri: grahaMaitriPoints(brideMoonRashi, groomMoonRashi),
    gana: ganaPoints(brideMoonNakshatra, groomMoonNakshatra),
    bhakoot: bhakootPoints(brideMoonRashi, groomMoonRashi),
    nadi: nadiPoints(brideMoonNakshatra, groomMoonNakshatra),
  };
  const totalScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

  const nadiCancelled = bridePada != null && groomPada != null && nadiDoshaCancelled(brideMoonNakshatra, groomMoonNakshatra, bridePada, groomPada);

  return {
    totalScore,
    maxScore: 36,
    breakdown,
    nadiDosha: breakdown.nadi === 0 && !nadiCancelled,
    bhakootDosha: breakdown.bhakoot === 0 && !bhakootDoshaCancelled(brideMoonRashi, groomMoonRashi),
    brideRashiName: RASHI_NAMES[brideMoonRashi],
    groomRashiName: RASHI_NAMES[groomMoonRashi],
  };
}
