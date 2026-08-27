import "server-only";

import { TITHI_NAMES, VARA_NAMES, YOGA_NAMES, karanaAt, nakshatraAt, tithiAt, varaAt, yogaAt, type GeoLocation } from "panchanga";
import { GrahaKey, NAKSHATRAS, RASHIS, nakshatraIndexOf, nakshatraPadaOf, normalizeDeg } from "@/lib/vedic/core";

/**
 * The five limbs of the Panchang, resolved for a birth moment rather than for "today".
 *
 * Every printed Kundli opens with these five values — Tithi, Vara, Nakshatra, Yoga, Karana — and
 * they are the basis of the birth Sankalpa. They come from the same `panchanga` package the daily
 * Panchang tool uses, so both surfaces agree by construction.
 */

/** Vimshottari lord of each nakshatra, repeating every nine. Also the nakshatra's ruling graha. */
const NAKSHATRA_LORDS: GrahaKey[] = ["ketu", "venus", "sun", "moon", "mars", "rahu", "jupiter", "saturn", "mercury"];

/** Deity, gana, yoni, nadi and varna per nakshatra — the classical attributes a Kundli lists. */
const NAKSHATRA_ATTRIBUTES: { deity: string; gana: string; yoni: string; nadi: string }[] = [
  { deity: "Ashwini Kumaras", gana: "Deva", yoni: "Horse", nadi: "Adi" },
  { deity: "Yama", gana: "Manushya", yoni: "Elephant", nadi: "Madhya" },
  { deity: "Agni", gana: "Rakshasa", yoni: "Sheep", nadi: "Antya" },
  { deity: "Brahma", gana: "Manushya", yoni: "Serpent", nadi: "Antya" },
  { deity: "Soma", gana: "Deva", yoni: "Serpent", nadi: "Madhya" },
  { deity: "Rudra", gana: "Manushya", yoni: "Dog", nadi: "Adi" },
  { deity: "Aditi", gana: "Deva", yoni: "Cat", nadi: "Adi" },
  { deity: "Brihaspati", gana: "Deva", yoni: "Sheep", nadi: "Madhya" },
  { deity: "Sarpa", gana: "Rakshasa", yoni: "Cat", nadi: "Antya" },
  { deity: "Pitru", gana: "Rakshasa", yoni: "Rat", nadi: "Antya" },
  { deity: "Bhaga", gana: "Manushya", yoni: "Rat", nadi: "Madhya" },
  { deity: "Aryaman", gana: "Manushya", yoni: "Cow", nadi: "Adi" },
  { deity: "Savitr", gana: "Deva", yoni: "Buffalo", nadi: "Adi" },
  { deity: "Vishvakarma", gana: "Rakshasa", yoni: "Tiger", nadi: "Madhya" },
  { deity: "Vayu", gana: "Deva", yoni: "Buffalo", nadi: "Antya" },
  { deity: "Indragni", gana: "Rakshasa", yoni: "Tiger", nadi: "Antya" },
  { deity: "Mitra", gana: "Deva", yoni: "Deer", nadi: "Madhya" },
  { deity: "Indra", gana: "Rakshasa", yoni: "Deer", nadi: "Adi" },
  { deity: "Nirriti", gana: "Rakshasa", yoni: "Dog", nadi: "Adi" },
  { deity: "Apas", gana: "Manushya", yoni: "Monkey", nadi: "Madhya" },
  { deity: "Vishvedevas", gana: "Manushya", yoni: "Mongoose", nadi: "Antya" },
  { deity: "Vishnu", gana: "Deva", yoni: "Monkey", nadi: "Antya" },
  { deity: "Vasu", gana: "Rakshasa", yoni: "Lion", nadi: "Madhya" },
  { deity: "Varuna", gana: "Rakshasa", yoni: "Horse", nadi: "Adi" },
  { deity: "Aja Ekapada", gana: "Manushya", yoni: "Lion", nadi: "Adi" },
  { deity: "Ahir Budhnya", gana: "Manushya", yoni: "Cow", nadi: "Madhya" },
  { deity: "Pushan", gana: "Deva", yoni: "Elephant", nadi: "Antya" },
];

/** Paksha — the waxing or waning fortnight, decided by which half of the lunar month the tithi is in. */
function pakshaOf(tithiIndex: number) {
  return tithiIndex < 15 ? "Shukla (waxing)" : "Krishna (waning)";
}

export type BirthPanchang = {
  tithiIndex: number;
  tithiName: string;
  paksha: string;
  varaName: string;
  nakshatraIndex: number;
  nakshatraName: string;
  nakshatraPada: number;
  nakshatraLord: GrahaKey;
  nakshatraDeity: string;
  gana: string;
  yoni: string;
  nadi: string;
  yogaIndex: number;
  yogaName: string;
  karanaName: string;
  /** Moon sign — the Rashi a Vedic reader means when they ask "what is your rashi". */
  moonRashiIndex: number;
  moonRashiName: string;
  /** Sun sign in the sidereal zodiac, not the Western tropical one. */
  sunRashiIndex: number;
  sunRashiName: string;
};

export function computeBirthPanchang({ birthInstant, latitude, longitude, timeZone, moonLongitude, sunLongitude }: {
  birthInstant: Date;
  latitude: number;
  longitude: number;
  timeZone: string;
  moonLongitude: number;
  sunLongitude: number;
}): BirthPanchang {
  const location: GeoLocation = { latitude, longitude, timeZone };

  const tithiIndex = tithiAt(birthInstant);
  const yogaIndex = yogaAt(birthInstant);
  // The Vedic day runs sunrise-to-sunrise, so a birth between midnight and sunrise belongs to the
  // previous weekday. varaAt applies that rule; it returns null only if the location is in a polar
  // period with no sunrise that day, where the civil weekday is the only sensible fallback.
  const vara = varaAt(birthInstant, location);
  const varaName = vara ? VARA_NAMES[vara.index] : VARA_NAMES[birthInstant.getUTCDay()];

  const moonNakshatra = nakshatraIndexOf(moonLongitude);
  const attributes = NAKSHATRA_ATTRIBUTES[moonNakshatra];

  return {
    tithiIndex,
    tithiName: TITHI_NAMES[tithiIndex],
    paksha: pakshaOf(tithiIndex),
    varaName,
    nakshatraIndex: moonNakshatra,
    nakshatraName: NAKSHATRAS[moonNakshatra],
    nakshatraPada: nakshatraPadaOf(moonLongitude),
    nakshatraLord: NAKSHATRA_LORDS[moonNakshatra % 9],
    nakshatraDeity: attributes.deity,
    gana: attributes.gana,
    yoni: attributes.yoni,
    nadi: attributes.nadi,
    yogaIndex,
    yogaName: YOGA_NAMES[yogaIndex],
    karanaName: karanaAt(birthInstant),
    moonRashiIndex: Math.floor(normalizeDeg(moonLongitude) / 30),
    moonRashiName: RASHIS[Math.floor(normalizeDeg(moonLongitude) / 30)].name,
    sunRashiIndex: Math.floor(normalizeDeg(sunLongitude) / 30),
    sunRashiName: RASHIS[Math.floor(normalizeDeg(sunLongitude) / 30)].name,
  };
}

/**
 * The Nama-akshara — the syllable classically prescribed for naming a child, determined by the
 * Moon's nakshatra pada at birth. Four syllables per nakshatra, one per pada.
 */
const PADA_SYLLABLES: string[][] = [
  ["Chu", "Che", "Cho", "La"], ["Lee", "Lu", "Le", "Lo"], ["A", "E", "U", "Ea"],
  ["O", "Va", "Vi", "Vu"], ["Ve", "Vo", "Ka", "Ki"], ["Ku", "Gha", "Ing", "Chha"],
  ["Ke", "Ko", "Ha", "Hi"], ["Hu", "He", "Ho", "Da"], ["Dee", "Doo", "Day", "Do"],
  ["Ma", "Mi", "Mu", "Me"], ["Mo", "Ta", "Ti", "Tu"], ["Te", "To", "Pa", "Pi"],
  ["Pu", "Sha", "Na", "Tha"], ["Pe", "Po", "Ra", "Ri"], ["Ru", "Re", "Ro", "Ta"],
  ["Ti", "Tu", "Te", "To"], ["Na", "Ni", "Nu", "Ne"], ["No", "Ya", "Yi", "Yu"],
  ["Ye", "Yo", "Bha", "Bhi"], ["Bhu", "Dha", "Pha", "Dha"], ["Bhe", "Bho", "Ja", "Ji"],
  ["Ju", "Je", "Jo", "Gha"], ["Ga", "Gi", "Gu", "Ge"], ["Go", "Sa", "Si", "Su"],
  ["Se", "So", "Da", "Di"], ["Du", "Tha", "Jha", "Da"], ["De", "Do", "Cha", "Chi"],
];

export function namaAksharaOf(moonLongitude: number) {
  const nakshatra = nakshatraIndexOf(moonLongitude);
  const pada = nakshatraPadaOf(moonLongitude);
  return PADA_SYLLABLES[nakshatra][pada - 1];
}
