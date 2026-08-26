import "server-only";

import { aspectsGraha } from "@/lib/vedic/aspects";
import { GRAHA_LABELS, GrahaKey, GrahaPosition, RASHIS, countFrom, houseOfRashi, ordinal } from "@/lib/vedic/core";
import { EXALTATION, NATURAL_BENEFICS, RASHI_LORDS, debilitationOf } from "@/lib/vedic/dignity";

/**
 * Classical yoga detection. A yoga is a named planetary combination that classical Jyotish treats
 * as materially changing a chart's reading — the part of a Kundli people actually remember.
 *
 * Only yogas with unambiguous, fully computable definitions are detected here. Combinations whose
 * classical definitions genuinely disagree between authorities (or that need Shadbala to resolve)
 * are deliberately left out rather than guessed at, since a falsely claimed Raja Yoga is worse
 * than a missing one.
 */

export type YogaStrength = "strong" | "moderate" | "notable";

export type Yoga = {
  key: string;
  name: string;
  sanskrit: string;
  category: "mahapurusha" | "raja" | "dhana" | "lunar" | "solar" | "challenging" | "auspicious";
  strength: YogaStrength;
  summary: string;
  /** The specific placements that triggered the detection — shown so a reader can verify it. */
  evidence: string;
};

const KENDRAS = [1, 4, 7, 10];
const TRIKONAS = [1, 5, 9];
const DUSTHANAS = [6, 8, 12];

function positionOf(positions: GrahaPosition[], graha: GrahaKey) {
  return positions.find((position) => position.graha === graha)!;
}

function houseOfGraha(positions: GrahaPosition[], graha: GrahaKey, ascendantRashiIndex: number) {
  return houseOfRashi(positionOf(positions, graha).rashiIndex, ascendantRashiIndex);
}

/** Which graha lords a given house from the Lagna. */
function lordOfHouse(house: number, ascendantRashiIndex: number): GrahaKey {
  return RASHI_LORDS[(ascendantRashiIndex + house - 1) % 12];
}

function isExalted(position: GrahaPosition) {
  return EXALTATION[position.graha]?.rashiIndex === position.rashiIndex;
}

function isDebilitated(position: GrahaPosition) {
  return debilitationOf(position.graha)?.rashiIndex === position.rashiIndex;
}

function isOwnSign(position: GrahaPosition) {
  return RASHI_LORDS[position.rashiIndex] === position.graha;
}

/**
 * Panch Mahapurusha Yogas — the five "great person" combinations. Each requires one of the five
 * non-luminary planets to sit in its own sign or exaltation AND occupy a kendra from the Lagna.
 * Both conditions are strict; a planet strong in dignity but in a cadent house does not qualify.
 */
const MAHAPURUSHA: { graha: GrahaKey; name: string; quality: string }[] = [
  { graha: "mars", name: "Ruchaka", quality: "commanding physical courage, discipline, and the drive to lead from the front" },
  { graha: "mercury", name: "Bhadra", quality: "sharp intellect, persuasive speech, and a gift for analysis and trade" },
  { graha: "jupiter", name: "Hamsa", quality: "wisdom, moral authority, and a naturally teaching, guiding presence" },
  { graha: "venus", name: "Malavya", quality: "refinement, artistic sensibility, comfort, and magnetic charm" },
  { graha: "saturn", name: "Shasha", quality: "endurance, authority built slowly, and mastery through sustained effort" },
];

function detectMahapurusha(positions: GrahaPosition[], ascendantRashiIndex: number): Yoga[] {
  const yogas: Yoga[] = [];
  for (const entry of MAHAPURUSHA) {
    const position = positionOf(positions, entry.graha);
    const house = houseOfRashi(position.rashiIndex, ascendantRashiIndex);
    if (!KENDRAS.includes(house)) continue;
    const exalted = isExalted(position);
    if (!exalted && !isOwnSign(position)) continue;

    yogas.push({
      key: `mahapurusha-${entry.graha}`,
      name: `${entry.name} Yoga`,
      sanskrit: `${entry.name} Mahapurusha Yoga`,
      category: "mahapurusha",
      strength: exalted ? "strong" : "moderate",
      summary: `One of the five Panch Mahapurusha Yogas — it marks ${entry.quality}.`,
      evidence: `${GRAHA_LABELS[entry.graha]} is ${exalted ? "exalted" : "in its own sign"} in ${RASHIS[position.rashiIndex].name}, occupying the ${ordinal(house)} house (a kendra) from the Lagna.`,
    });
  }
  return yogas;
}

/** Gaja Kesari — Jupiter in a kendra from the Moon: resilience, reputation, and support. */
function detectGajaKesari(positions: GrahaPosition[], ascendantRashiIndex: number): Yoga | null {
  const jupiter = positionOf(positions, "jupiter");
  const moon = positionOf(positions, "moon");
  const distance = countFrom(moon.rashiIndex, jupiter.rashiIndex);
  if (!KENDRAS.includes(distance)) return null;

  return {
    key: "gaja-kesari",
    name: "Gaja Kesari Yoga",
    sanskrit: "Gaja Kesari Yoga",
    category: "auspicious",
    strength: distance === 1 ? "strong" : "moderate",
    summary: "Jupiter supporting the Moon lends steady judgement, a good name, and the kind of resilience that gathers allies over a lifetime.",
    evidence: `Jupiter is in ${RASHIS[jupiter.rashiIndex].name}, the ${ordinal(distance)} house from your Moon in ${RASHIS[moon.rashiIndex].name} — a kendra (angle) from the Moon.`,
  };
}

/** Budhaditya — Sun and Mercury together: analytical intelligence and communicative skill. */
function detectBudhaditya(positions: GrahaPosition[], ascendantRashiIndex: number): Yoga | null {
  const sun = positionOf(positions, "sun");
  const mercury = positionOf(positions, "mercury");
  if (sun.rashiIndex !== mercury.rashiIndex) return null;

  // Mercury never strays far from the Sun, so this pairing is common; combustion is what decides
  // whether it actually delivers, and saying so keeps the reading honest.
  const separation = Math.abs(sun.longitude - mercury.longitude);
  const tooClose = separation < 14;

  return {
    key: "budhaditya",
    name: "Budhaditya Yoga",
    sanskrit: "Budha-Aditya Yoga",
    category: "auspicious",
    strength: tooClose ? "notable" : "moderate",
    summary: "The Sun and Mercury together sharpen intellect, learning, and the ability to explain things clearly.",
    evidence: `Sun and Mercury are both in ${RASHIS[sun.rashiIndex].name} (${ordinal(houseOfRashi(sun.rashiIndex, ascendantRashiIndex))} house)${tooClose ? " — but Mercury is combust, which classically mutes the yoga's results" : ""}.`,
  };
}

/** Chandra-Mangal — Moon with Mars: drive applied to earning, often flagged for wealth. */
function detectChandraMangal(positions: GrahaPosition[], ascendantRashiIndex: number): Yoga | null {
  const moon = positionOf(positions, "moon");
  const mars = positionOf(positions, "mars");
  if (moon.rashiIndex !== mars.rashiIndex) return null;

  return {
    key: "chandra-mangal",
    name: "Chandra-Mangal Yoga",
    sanskrit: "Chandra-Mangala Yoga",
    category: "dhana",
    strength: "moderate",
    summary: "Moon with Mars gives emotional drive channelled into enterprise — classically read as a wealth-generating combination, though it can run hot.",
    evidence: `Moon and Mars are both in ${RASHIS[moon.rashiIndex].name} (${ordinal(houseOfRashi(moon.rashiIndex, ascendantRashiIndex))} house).`,
  };
}

/**
 * Raja Yoga — a kendra lord and a trikona lord linked by conjunction or mutual aspect. This is the
 * central "rise in life" combination of Parashari astrology. The 1st house lords both a kendra and
 * a trikona, so pairings involving the Lagna lord alone are excluded to avoid trivial matches.
 */
function detectRajaYogas(positions: GrahaPosition[], ascendantRashiIndex: number): Yoga[] {
  const yogas: Yoga[] = [];
  const seen = new Set<string>();

  for (const kendra of KENDRAS) {
    for (const trikona of TRIKONAS) {
      if (kendra === trikona) continue;
      const kendraLord = lordOfHouse(kendra, ascendantRashiIndex);
      const trikonaLord = lordOfHouse(trikona, ascendantRashiIndex);
      if (kendraLord === trikonaLord) continue;

      const kendraPosition = positionOf(positions, kendraLord);
      const trikonaPosition = positionOf(positions, trikonaLord);
      const conjunct = kendraPosition.rashiIndex === trikonaPosition.rashiIndex;
      const mutualAspect = aspectsGraha(kendraPosition, trikonaPosition) && aspectsGraha(trikonaPosition, kendraPosition);
      if (!conjunct && !mutualAspect) continue;

      const key = [kendraLord, trikonaLord].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);

      yogas.push({
        key: `raja-${key}`,
        name: "Raja Yoga",
        sanskrit: "Raja Yoga",
        category: "raja",
        strength: conjunct ? "strong" : "moderate",
        summary: "A kendra lord and a trikona lord joined — the classical signature of rise in status, authority, and recognition, usually delivered during their dashas.",
        evidence: `${GRAHA_LABELS[kendraLord]} (lord of the ${ordinal(kendra)} house) and ${GRAHA_LABELS[trikonaLord]} (lord of the ${ordinal(trikona)} house) are ${conjunct ? `conjunct in ${RASHIS[kendraPosition.rashiIndex].name}` : "in mutual aspect"}.`,
      });
    }
  }

  return yogas;
}

/**
 * Dhana Yoga — the 2nd (accumulated wealth) or 11th (gains) lord linked to the 1st, 5th or 9th
 * lord. Classical wealth-formation, distinct from the status-oriented Raja Yogas.
 */
function detectDhanaYogas(positions: GrahaPosition[], ascendantRashiIndex: number): Yoga[] {
  const yogas: Yoga[] = [];
  const seen = new Set<string>();

  for (const wealthHouse of [2, 11]) {
    for (const supportHouse of [1, 5, 9]) {
      const wealthLord = lordOfHouse(wealthHouse, ascendantRashiIndex);
      const supportLord = lordOfHouse(supportHouse, ascendantRashiIndex);
      if (wealthLord === supportLord) continue;

      const wealthPosition = positionOf(positions, wealthLord);
      const supportPosition = positionOf(positions, supportLord);
      const conjunct = wealthPosition.rashiIndex === supportPosition.rashiIndex;
      const mutualAspect = aspectsGraha(wealthPosition, supportPosition) && aspectsGraha(supportPosition, wealthPosition);
      if (!conjunct && !mutualAspect) continue;

      const key = [wealthLord, supportLord].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);

      yogas.push({
        key: `dhana-${key}`,
        name: "Dhana Yoga",
        sanskrit: "Dhana Yoga",
        category: "dhana",
        strength: conjunct ? "strong" : "moderate",
        summary: "A wealth-house lord tied to a supportive trine lord — classically read as capacity to accumulate and hold resources.",
        evidence: `${GRAHA_LABELS[wealthLord]} (lord of the ${ordinal(wealthHouse)} house) and ${GRAHA_LABELS[supportLord]} (lord of the ${ordinal(supportHouse)} house) are ${conjunct ? `conjunct in ${RASHIS[wealthPosition.rashiIndex].name}` : "in mutual aspect"}.`,
      });
    }
  }

  return yogas;
}

/**
 * Lunar yogas from planets flanking the Moon. Sunapha (2nd from Moon occupied), Anapha (12th),
 * Durudhara (both), and Kemadruma (neither — the isolated Moon). The Sun is excluded throughout
 * because it is nearly always adjacent to the Moon and would make these meaningless.
 */
function detectLunarYogas(positions: GrahaPosition[], ascendantRashiIndex: number): Yoga[] {
  const moon = positionOf(positions, "moon");
  const flanking = positions.filter((position) => !["moon", "sun", "rahu", "ketu"].includes(position.graha));

  const second = flanking.filter((position) => countFrom(moon.rashiIndex, position.rashiIndex) === 2);
  const twelfth = flanking.filter((position) => countFrom(moon.rashiIndex, position.rashiIndex) === 12);
  const withMoon = flanking.filter((position) => position.rashiIndex === moon.rashiIndex);

  if (second.length && twelfth.length) {
    return [{
      key: "durudhara",
      name: "Durudhara Yoga",
      sanskrit: "Durudhara Yoga",
      category: "lunar",
      strength: "moderate",
      summary: "Planets flanking the Moon on both sides — classically a sign of material comfort, generosity, and steady support around you.",
      evidence: `${second.map((p) => GRAHA_LABELS[p.graha]).join(", ")} sit in the 2nd from the Moon and ${twelfth.map((p) => GRAHA_LABELS[p.graha]).join(", ")} in the 12th.`,
    }];
  }

  if (second.length) {
    return [{
      key: "sunapha",
      name: "Sunapha Yoga",
      sanskrit: "Sunapha Yoga",
      category: "lunar",
      strength: "notable",
      summary: "Planets in the 2nd from the Moon — self-earned resources and a capable, self-reliant streak.",
      evidence: `${second.map((p) => GRAHA_LABELS[p.graha]).join(", ")} occupy the 2nd house from your Moon in ${RASHIS[moon.rashiIndex].name}.`,
    }];
  }

  if (twelfth.length) {
    return [{
      key: "anapha",
      name: "Anapha Yoga",
      sanskrit: "Anapha Yoga",
      category: "lunar",
      strength: "notable",
      summary: "Planets in the 12th from the Moon — a well-regarded, self-possessed temperament with an inward, reflective side.",
      evidence: `${twelfth.map((p) => GRAHA_LABELS[p.graha]).join(", ")} occupy the 12th house from your Moon in ${RASHIS[moon.rashiIndex].name}.`,
    }];
  }

  if (!withMoon.length) {
    return [{
      key: "kemadruma",
      name: "Kemadruma Yoga",
      sanskrit: "Kemadruma Yoga",
      category: "challenging",
      strength: "notable",
      summary: "The Moon stands alone with no planet beside or flanking it. Classically read as periods of feeling unsupported — though it is very commonly cancelled, including by any planet in a kendra from the Lagna or by a strong Moon.",
      evidence: `No planet (other than the Sun and nodes) sits with your Moon in ${RASHIS[moon.rashiIndex].name}, or in the 2nd or 12th from it.`,
    }];
  }

  return [];
}

/**
 * Vipreet Raja Yoga — a dusthana lord (6th, 8th, 12th) placed in another dusthana. The classical
 * reading is that two difficulties cancel: hardship early, then unusual rise through it.
 */
function detectVipreetRajaYogas(positions: GrahaPosition[], ascendantRashiIndex: number): Yoga[] {
  const yogas: Yoga[] = [];
  const names: Record<number, string> = { 6: "Harsha", 8: "Sarala", 12: "Vimala" };

  for (const house of DUSTHANAS) {
    const lord = lordOfHouse(house, ascendantRashiIndex);
    const lordHouse = houseOfGraha(positions, lord, ascendantRashiIndex);
    if (!DUSTHANAS.includes(lordHouse) || lordHouse === house) continue;

    yogas.push({
      key: `vipreet-${house}`,
      name: `${names[house]} Yoga (Vipreet Raja Yoga)`,
      sanskrit: `${names[house]} Yoga`,
      category: "raja",
      strength: "moderate",
      summary: "A difficult-house lord placed in another difficult house — classically a reversal combination: obstacles that ultimately convert into unusual advantage.",
      evidence: `${GRAHA_LABELS[lord]}, lord of the ${ordinal(house)} house, is placed in the ${ordinal(lordHouse)} house.`,
    });
  }

  return yogas;
}

/**
 * Neecha Bhanga — cancellation of debilitation. Only the two least-disputed cancellation rules are
 * applied: the dispositor of the debilitated planet in a kendra from the Lagna or Moon, or the
 * planet that would be exalted in that sign sitting in a kendra.
 */
function detectNeechaBhanga(positions: GrahaPosition[], ascendantRashiIndex: number): Yoga[] {
  const yogas: Yoga[] = [];
  const moon = positionOf(positions, "moon");

  for (const position of positions) {
    if (!isDebilitated(position)) continue;

    const dispositor = RASHI_LORDS[position.rashiIndex];
    const dispositorPosition = positions.find((entry) => entry.graha === dispositor);
    const reasons: string[] = [];

    if (dispositorPosition) {
      const fromLagna = houseOfRashi(dispositorPosition.rashiIndex, ascendantRashiIndex);
      const fromMoon = countFrom(moon.rashiIndex, dispositorPosition.rashiIndex);
      if (KENDRAS.includes(fromLagna)) reasons.push(`its dispositor ${GRAHA_LABELS[dispositor]} sits in the ${ordinal(fromLagna)} house, a kendra from the Lagna`);
      else if (KENDRAS.includes(fromMoon)) reasons.push(`its dispositor ${GRAHA_LABELS[dispositor]} sits in the ${ordinal(fromMoon)} house from the Moon, a kendra`);
    }

    const exaltedRuler = (Object.keys(EXALTATION) as GrahaKey[]).find((graha) => EXALTATION[graha]?.rashiIndex === position.rashiIndex);
    if (exaltedRuler) {
      const rulerPosition = positions.find((entry) => entry.graha === exaltedRuler);
      if (rulerPosition && KENDRAS.includes(houseOfRashi(rulerPosition.rashiIndex, ascendantRashiIndex))) {
        reasons.push(`${GRAHA_LABELS[exaltedRuler]}, which is exalted in this sign, occupies a kendra`);
      }
    }

    if (!reasons.length) continue;

    yogas.push({
      key: `neecha-bhanga-${position.graha}`,
      name: "Neecha Bhanga Raja Yoga",
      sanskrit: "Neecha Bhanga Raja Yoga",
      category: "raja",
      strength: "moderate",
      summary: "A debilitated planet whose weakness is classically cancelled — often read as a late-blooming strength that outperforms expectations.",
      evidence: `${GRAHA_LABELS[position.graha]} is debilitated in ${RASHIS[position.rashiIndex].name}, but ${reasons.join(", and ")}.`,
    });
  }

  return yogas;
}

/** Amala — an unblemished benefic in the 10th from Lagna or Moon: lasting good reputation. */
function detectAmala(positions: GrahaPosition[], ascendantRashiIndex: number): Yoga | null {
  const moon = positionOf(positions, "moon");
  for (const position of positions) {
    if (!NATURAL_BENEFICS.includes(position.graha) || position.graha === "moon") continue;
    const fromLagna = houseOfRashi(position.rashiIndex, ascendantRashiIndex);
    const fromMoon = countFrom(moon.rashiIndex, position.rashiIndex);
    if (fromLagna !== 10 && fromMoon !== 10) continue;

    return {
      key: "amala",
      name: "Amala Yoga",
      sanskrit: "Amala Yoga",
      category: "auspicious",
      strength: "moderate",
      summary: "A benefic in the 10th house — classically a spotless reputation and work that earns lasting respect.",
      evidence: `${GRAHA_LABELS[position.graha]} occupies the 10th house from ${fromLagna === 10 ? "the Lagna" : "the Moon"}, in ${RASHIS[position.rashiIndex].name}.`,
    };
  }
  return null;
}

/** Every yoga detected in a chart, ordered strongest-first for display. */
export function detectYogas(positions: GrahaPosition[], ascendantRashiIndex: number): Yoga[] {
  const yogas: Yoga[] = [
    ...detectMahapurusha(positions, ascendantRashiIndex),
    ...detectRajaYogas(positions, ascendantRashiIndex),
    ...detectDhanaYogas(positions, ascendantRashiIndex),
    ...detectVipreetRajaYogas(positions, ascendantRashiIndex),
    ...detectNeechaBhanga(positions, ascendantRashiIndex),
    ...detectLunarYogas(positions, ascendantRashiIndex),
  ];

  const gajaKesari = detectGajaKesari(positions, ascendantRashiIndex);
  if (gajaKesari) yogas.push(gajaKesari);
  const budhaditya = detectBudhaditya(positions, ascendantRashiIndex);
  if (budhaditya) yogas.push(budhaditya);
  const chandraMangal = detectChandraMangal(positions, ascendantRashiIndex);
  if (chandraMangal) yogas.push(chandraMangal);
  const amala = detectAmala(positions, ascendantRashiIndex);
  if (amala) yogas.push(amala);

  const rank: Record<YogaStrength, number> = { strong: 0, moderate: 1, notable: 2 };
  return yogas.sort((a, b) => rank[a.strength] - rank[b.strength]);
}
