/**
 * Whether the site gives away AI readings: a member's first question, and personas priced at 0.
 *
 * Both call Gemini with no payment behind them, and sign-up is free, so anyone willing to make
 * accounts could run up the AI bill. Off unless ALLOW_FREE_AI_READINGS is exactly "true"; with it
 * off, every Gemini call the site makes is one a customer has paid for.
 */
export function freeAiReadingsEnabled(): boolean {
  return process.env.ALLOW_FREE_AI_READINGS === "true";
}

/** A persona is offered publicly when it is live and either charges for readings or free readings
 * are switched on. A price-0 persona stays hidden otherwise, rather than taking requests it will refuse. */
export function isPersonaOffered(persona: { active: boolean; price: number }): boolean {
  return persona.active && (persona.price > 0 || freeAiReadingsEnabled());
}
