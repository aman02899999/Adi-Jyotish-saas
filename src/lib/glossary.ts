/** Plain-language definitions for Sanskrit/Jyotish terms used across the site. Consumed by
 * <GlossaryTerm> so any jargon word can carry a one-line explainer without every page having to
 * write its own. Keep definitions short (one sentence, no nested jargon) — this exists specifically
 * so a first-time visitor never has to leave the page to look a word up. */
export const GLOSSARY = {
  kundli: {
    term: "Kundli",
    definition: "Your birth chart — a map of where each planet sat in the sky at the exact moment you were born.",
  },
  lagna: {
    term: "Lagna",
    definition: "Your Ascendant — the sign rising on the eastern horizon at your birth moment. It sets the layout of your whole chart.",
  },
  rashi: {
    term: "Rashi",
    definition: "Your Moon sign — the zodiac sign the Moon was in when you were born. In Vedic astrology this is used more than the Sun sign.",
  },
  nakshatra: {
    term: "Nakshatra",
    definition: "Your birth star — one of 27 lunar constellations. It's a finer-grained placement than your Moon sign, used for timing and matching.",
  },
  dasha: {
    term: "Dasha",
    definition: "A planetary time period. Vedic astrology divides your life into cycles ruled by different planets, each bringing its own themes.",
  },
  panchang: {
    term: "Panchang",
    definition: "The Vedic day calendar — five elements (lunar day, star, planetary yoga, and two more) that say what a given date is good or bad for.",
  },
  muhurat: {
    term: "Muhurat",
    definition: "An auspicious window of time — a specific hour range considered favorable for starting something important.",
  },
  varshphal: {
    term: "Varshphal",
    definition: "Your annual forecast chart, recalculated for the exact moment the Sun returns to its birth position each year (your \"solar return\").",
  },
  gunaMilan: {
    term: "Guna Milan",
    definition: "An 8-point compatibility score (out of 36) comparing two birth charts, traditionally used to assess marriage compatibility.",
  },
  tithi: {
    term: "Tithi",
    definition: "A lunar day — the time it takes the Moon to move 12° further from the Sun. A lunar month has 30 of them.",
  },
  graha: {
    term: "Graha",
    definition: "A planet, in the Vedic astrology sense — includes the Sun, Moon, and lunar nodes alongside the visible planets.",
  },
  bhava: {
    term: "Bhava",
    definition: "A house — one of 12 life areas (career, relationships, home, and so on) that a chart is divided into.",
  },
  mangalDosha: {
    term: "Mangal Dosha",
    definition: "A chart placement (Mars in specific houses) traditionally checked before marriage matching, believed to need balancing against a similar placement in a partner's chart.",
  },
  ashtakoot: {
    term: "Ashtakoot",
    definition: "The eight-factor scoring system behind Guna Milan compatibility matching — each factor checks a different kind of harmony between two charts.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
