import "server-only";

import { GRAHAS, GrahaKey, GrahaPosition, RASHIS, normalizeDeg } from "@/lib/vedic/core";

/**
 * Classical Parashari planetary dignity: rulership, exaltation/debilitation, Moolatrikona,
 * natural friendship (Naisargika Maitri), combustion (Asta), and planetary war (Graha Yuddha).
 *
 * Every table here is the standard Brihat Parashara Hora Shastra set. The unit tests in
 * dignity.test.ts assert the structural invariants (each rashi has exactly one lord, debilitation
 * is always exactly 180° from exaltation, every planet appears in every other planet's
 * friend/neutral/enemy partition exactly once) so a typo in a table fails the build rather than
 * silently producing a confidently-wrong chart reading.
 */

/** Rashi lords, indexed by rashi (0 = Mesha/Aries). */
export const RASHI_LORDS: GrahaKey[] = [
  "mars",    // Mesha
  "venus",   // Vrishabha
  "mercury", // Mithuna
  "moon",    // Karka
  "sun",     // Simha
  "mercury", // Kanya
  "venus",   // Tula
  "mars",    // Vrishchika
  "jupiter", // Dhanu
  "saturn",  // Makara
  "saturn",  // Kumbha
  "jupiter", // Meena
];

/** Exaltation point (rashi index + exact degree). Debilitation is the point 180° opposite. */
export const EXALTATION: Partial<Record<GrahaKey, { rashiIndex: number; degree: number }>> = {
  sun: { rashiIndex: 0, degree: 10 },      // Mesha 10°
  moon: { rashiIndex: 1, degree: 3 },      // Vrishabha 3°
  mars: { rashiIndex: 9, degree: 28 },     // Makara 28°
  mercury: { rashiIndex: 5, degree: 15 },  // Kanya 15°
  jupiter: { rashiIndex: 3, degree: 5 },   // Karka 5°
  venus: { rashiIndex: 11, degree: 27 },   // Meena 27°
  saturn: { rashiIndex: 6, degree: 20 },   // Tula 20°
  rahu: { rashiIndex: 1, degree: 20 },     // Vrishabha 20° (Parashari; some schools use Mithuna)
  ketu: { rashiIndex: 7, degree: 20 },     // Vrishchika 20°
};

/** Moolatrikona span — a dignity between exaltation and own-sign in strength. */
export const MOOLATRIKONA: Partial<Record<GrahaKey, { rashiIndex: number; from: number; to: number }>> = {
  sun: { rashiIndex: 4, from: 0, to: 20 },      // Simha 0°–20°
  moon: { rashiIndex: 1, from: 4, to: 30 },     // Vrishabha 4°–30°
  mars: { rashiIndex: 0, from: 0, to: 12 },     // Mesha 0°–12°
  mercury: { rashiIndex: 5, from: 16, to: 20 }, // Kanya 16°–20°
  jupiter: { rashiIndex: 8, from: 0, to: 10 },  // Dhanu 0°–10°
  venus: { rashiIndex: 6, from: 0, to: 15 },    // Tula 0°–15°
  saturn: { rashiIndex: 10, from: 0, to: 20 },  // Kumbha 0°–20°
};

/** Naisargika (natural) friendship. Anything not listed as friend or enemy is neutral. */
export const NATURAL_FRIENDS: Record<GrahaKey, GrahaKey[]> = {
  sun: ["moon", "mars", "jupiter"],
  moon: ["sun", "mercury"],
  mars: ["sun", "moon", "jupiter"],
  mercury: ["sun", "venus"],
  jupiter: ["sun", "moon", "mars"],
  venus: ["mercury", "saturn"],
  saturn: ["mercury", "venus"],
  rahu: ["venus", "saturn", "mercury"],
  ketu: ["mars", "venus", "saturn"],
};

export const NATURAL_ENEMIES: Record<GrahaKey, GrahaKey[]> = {
  sun: ["venus", "saturn"],
  moon: [],
  mars: ["mercury"],
  mercury: ["moon"],
  jupiter: ["mercury", "venus"],
  venus: ["sun", "moon"],
  saturn: ["sun", "moon", "mars"],
  rahu: ["sun", "moon", "mars"],
  ketu: ["sun", "moon"],
};

/**
 * Combustion (Asta) orbs in degrees of separation from the Sun. Retrograde planets combust at a
 * tighter orb — a distinction most simplified engines drop, but it materially changes whether
 * Mercury and Venus (the two planets most often near the Sun) read as combust.
 */
const COMBUSTION_ORB: Partial<Record<GrahaKey, { direct: number; retrograde: number }>> = {
  moon: { direct: 12, retrograde: 12 },
  mars: { direct: 17, retrograde: 17 },
  mercury: { direct: 14, retrograde: 12 },
  jupiter: { direct: 11, retrograde: 11 },
  venus: { direct: 10, retrograde: 8 },
  saturn: { direct: 15, retrograde: 15 },
};

export type Dignity = "exalted" | "moolatrikona" | "own" | "great-friend" | "friend" | "neutral" | "enemy" | "great-enemy" | "debilitated";

export const DIGNITY_LABELS: Record<Dignity, string> = {
  exalted: "Exalted (Uccha)",
  moolatrikona: "Moolatrikona",
  own: "Own sign (Swakshetra)",
  "great-friend": "Great friend's sign (Adhimitra)",
  friend: "Friend's sign (Mitra)",
  neutral: "Neutral sign (Sama)",
  enemy: "Enemy's sign (Shatru)",
  "great-enemy": "Great enemy's sign (Adhishatru)",
  debilitated: "Debilitated (Neecha)",
};

export function debilitationOf(graha: GrahaKey) {
  const exalted = EXALTATION[graha];
  if (!exalted) return null;
  return { rashiIndex: (exalted.rashiIndex + 6) % 12, degree: exalted.degree };
}

function naturalRelation(from: GrahaKey, toward: GrahaKey): "friend" | "enemy" | "neutral" {
  if (NATURAL_FRIENDS[from].includes(toward)) return "friend";
  if (NATURAL_ENEMIES[from].includes(toward)) return "enemy";
  return "neutral";
}

/**
 * Tatkalika (temporary) relationship: a planet is a temporary friend of anything in the 2nd, 3rd,
 * 4th, 10th, 11th or 12th house from itself, and a temporary enemy of the rest. Combined with the
 * natural relation this gives the Panchadha (five-fold) compound relationship that actually
 * governs how a placement performs.
 */
function temporaryRelation(fromRashi: number, towardRashi: number): "friend" | "enemy" {
  const distance = ((towardRashi - fromRashi + 12) % 12) + 1;
  return [2, 3, 4, 10, 11, 12].includes(distance) ? "friend" : "enemy";
}

function compoundRelation(natural: "friend" | "enemy" | "neutral", temporary: "friend" | "enemy"): Dignity {
  if (natural === "friend") return temporary === "friend" ? "great-friend" : "neutral";
  if (natural === "enemy") return temporary === "friend" ? "neutral" : "great-enemy";
  return temporary === "friend" ? "friend" : "enemy";
}

/**
 * Full dignity of a placement, checked in classical precedence order: exaltation and debilitation
 * are absolute (they override sign ownership), then Moolatrikona, then own sign, and only then
 * does the compound friendship of the dispositor decide.
 */
export function dignityOf(graha: GrahaKey, rashiIndex: number, degreeInRashi: number): Dignity {
  const exalted = EXALTATION[graha];
  if (exalted && exalted.rashiIndex === rashiIndex) return "exalted";
  const debilitated = debilitationOf(graha);
  if (debilitated && debilitated.rashiIndex === rashiIndex) return "debilitated";

  const moolatrikona = MOOLATRIKONA[graha];
  if (moolatrikona && moolatrikona.rashiIndex === rashiIndex && degreeInRashi >= moolatrikona.from && degreeInRashi < moolatrikona.to) {
    return "moolatrikona";
  }

  const lord = RASHI_LORDS[rashiIndex];
  if (lord === graha) return "own";

  // Rahu and Ketu own no rashi, so they have no dispositor-based seat of their own; their
  // compound relationship is read against the sign lord like any other graha.
  return compoundRelation(naturalRelation(graha, lord), temporaryRelation(rashiIndex, rashiIndex));
}

/** Dignity for a graha whose dispositor's own position is known — the accurate five-fold form. */
export function compoundDignityOf(graha: GrahaKey, rashiIndex: number, degreeInRashi: number, dispositorRashiIndex: number, ownRashiIndex: number): Dignity {
  const exalted = EXALTATION[graha];
  if (exalted && exalted.rashiIndex === rashiIndex) return "exalted";
  const debilitated = debilitationOf(graha);
  if (debilitated && debilitated.rashiIndex === rashiIndex) return "debilitated";

  const moolatrikona = MOOLATRIKONA[graha];
  if (moolatrikona && moolatrikona.rashiIndex === rashiIndex && degreeInRashi >= moolatrikona.from && degreeInRashi < moolatrikona.to) {
    return "moolatrikona";
  }

  const lord = RASHI_LORDS[rashiIndex];
  if (lord === graha) return "own";

  return compoundRelation(naturalRelation(graha, lord), temporaryRelation(ownRashiIndex, dispositorRashiIndex));
}

/** Angular separation between two ecliptic longitudes, always 0–180. */
export function separation(a: number, b: number) {
  const diff = Math.abs(normalizeDeg(a) - normalizeDeg(b)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export type CombustionResult = { combust: boolean; separationDeg: number; orbDeg: number | null };

/** Whether a graha is combust (Asta) — swallowed by the Sun's glare and considered weakened. */
export function combustionOf(position: GrahaPosition, sunLongitude: number): CombustionResult {
  const orbs = COMBUSTION_ORB[position.graha];
  const separationDeg = separation(position.longitude, sunLongitude);
  if (!orbs) return { combust: false, separationDeg, orbDeg: null };
  const orbDeg = position.isRetrograde ? orbs.retrograde : orbs.direct;
  return { combust: separationDeg < orbDeg, separationDeg, orbDeg };
}

/**
 * Graha Yuddha (planetary war): two of the five tara grahas (Mars..Saturn — never the luminaries
 * or the shadow nodes) within one degree of each other. The one with the lower longitude is the
 * classical winner in the most widely followed rule.
 */
export type PlanetaryWar = { winner: GrahaKey; loser: GrahaKey; separationDeg: number };

const WAR_ELIGIBLE: GrahaKey[] = ["mars", "mercury", "jupiter", "venus", "saturn"];

export function detectPlanetaryWars(positions: GrahaPosition[]): PlanetaryWar[] {
  const eligible = positions.filter((position) => WAR_ELIGIBLE.includes(position.graha));
  const wars: PlanetaryWar[] = [];
  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      const separationDeg = separation(eligible[i].longitude, eligible[j].longitude);
      if (separationDeg >= 1) continue;
      const [winner, loser] = eligible[i].longitude <= eligible[j].longitude ? [eligible[i], eligible[j]] : [eligible[j], eligible[i]];
      wars.push({ winner: winner.graha, loser: loser.graha, separationDeg });
    }
  }
  return wars;
}

/**
 * Baladi Avastha — the five "ages" of a planet by its degree within its sign, a classical
 * strength modifier. Odd signs run infant→dead across the sign; even signs run in reverse.
 */
export type Avastha = "bala" | "kumara" | "yuva" | "vriddha" | "mrita";

export const AVASTHA_LABELS: Record<Avastha, string> = {
  bala: "Bala (infant)",
  kumara: "Kumara (child)",
  yuva: "Yuva (youth — strongest)",
  vriddha: "Vriddha (old)",
  mrita: "Mrita (dead — weakest)",
};

const AVASTHA_ORDER: Avastha[] = ["bala", "kumara", "yuva", "vriddha", "mrita"];

export function avasthaOf(rashiIndex: number, degreeInRashi: number): Avastha {
  const step = Math.min(4, Math.floor(degreeInRashi / 6));
  const isOddSign = rashiIndex % 2 === 0; // rashiIndex 0 = Mesha = the 1st (odd) sign
  return isOddSign ? AVASTHA_ORDER[step] : AVASTHA_ORDER[4 - step];
}

/** Natural benefic/malefic classification. Mercury is benefic unless with a malefic; the Moon is
 * benefic when waxing. Both context rules are applied by the caller that knows the full chart. */
export const NATURAL_BENEFICS: GrahaKey[] = ["jupiter", "venus", "mercury", "moon"];
export const NATURAL_MALEFICS: GrahaKey[] = ["sun", "mars", "saturn", "rahu", "ketu"];

export type GrahaDignityDetail = {
  graha: GrahaKey;
  dignity: Dignity;
  dignityLabel: string;
  dispositor: GrahaKey;
  avastha: Avastha;
  avasthaLabel: string;
  combust: boolean;
  combustSeparationDeg: number;
  inPlanetaryWar: boolean;
  wonPlanetaryWar: boolean;
  isBenefic: boolean;
};

/** Dignity detail for every graha in a chart, resolved with full knowledge of the other placements. */
export function buildDignityTable(positions: GrahaPosition[]): GrahaDignityDetail[] {
  const sun = positions.find((position) => position.graha === "sun")!;
  const wars = detectPlanetaryWars(positions);
  const byGraha = new Map(positions.map((position) => [position.graha, position]));

  return GRAHAS.map((graha) => {
    const position = byGraha.get(graha)!;
    const dispositor = RASHI_LORDS[position.rashiIndex];
    const dispositorPosition = byGraha.get(dispositor);
    const dignity = dispositorPosition
      ? compoundDignityOf(graha, position.rashiIndex, position.degreeInRashi, dispositorPosition.rashiIndex, position.rashiIndex)
      : dignityOf(graha, position.rashiIndex, position.degreeInRashi);
    const combustion = combustionOf(position, sun.longitude);
    const war = wars.find((entry) => entry.winner === graha || entry.loser === graha);
    const avastha = avasthaOf(position.rashiIndex, position.degreeInRashi);

    return {
      graha,
      dignity,
      dignityLabel: DIGNITY_LABELS[dignity],
      dispositor,
      avastha,
      avasthaLabel: AVASTHA_LABELS[avastha],
      combust: combustion.combust,
      combustSeparationDeg: combustion.separationDeg,
      inPlanetaryWar: Boolean(war),
      wonPlanetaryWar: war?.winner === graha,
      isBenefic: NATURAL_BENEFICS.includes(graha),
    };
  });
}

export function rashiLordLabel(rashiIndex: number) {
  return `${RASHIS[rashiIndex].name} (lord: ${RASHI_LORDS[rashiIndex]})`;
}
