import "server-only";

// Standard 78-card deck (22 Major Arcana + 56 Minor Arcana). Card meanings aren't encoded here —
// Gemini interprets each drawn name/orientation directly, the same way a real reader works from
// just the card and its position, not a lookup table.
const MAJOR_ARCANA = [
  "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor",
  "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit",
  "Wheel of Fortune", "Justice", "The Hanged Man", "Death", "Temperance",
  "The Devil", "The Tower", "The Star", "The Moon", "The Sun", "Judgement", "The World",
];

const MINOR_SUITS = ["Cups", "Pentacles", "Swords", "Wands"];
const MINOR_RANKS = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"];
const MINOR_ARCANA = MINOR_SUITS.flatMap((suit) => MINOR_RANKS.map((rank) => `${rank} of ${suit}`));

export const TAROT_DECK = [...MAJOR_ARCANA, ...MINOR_ARCANA];

export type TarotCardDraw = { name: string; position: string; reversed: boolean };

const SPREAD_POSITIONS = ["Bhoot (Past)", "Vartaman (Present)", "Bhavishya (Future)"];

/** Server-side draw so the spread can't be influenced by the client — about 30% reversed, the
 * usual convention for a hand-shuffled deck rather than an even coin flip. */
export function drawTarotSpread(): TarotCardDraw[] {
  const deck = [...TAROT_DECK];
  return SPREAD_POSITIONS.map((position) => {
    const index = Math.floor(Math.random() * deck.length);
    const [name] = deck.splice(index, 1);
    return { name, position, reversed: Math.random() < 0.3 };
  });
}
