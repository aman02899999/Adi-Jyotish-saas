/** New/unreviewed practitioners are discounted to encourage first bookings; once a practitioner
 * has enough published reviews to establish trust, they charge their full listed rate. Used by
 * both the marketplace display price (marketplace.ts) and the actual instant-chat charge
 * (chat.ts) so what's shown on a practitioner's card is exactly what gets billed. Only applies to
 * the real (non-AI) practitioners' per-minute rate — the AI-powered ones use a flat session price
 * (see computeFixedSessionPrice below) that already folds reviews into the number directly. */
export function reviewDiscountPercent(reviewCount: number): number {
  if (reviewCount === 0) return 30;
  if (reviewCount < 10) return 20;
  if (reviewCount < 25) return 10;
  return 0;
}

/** Flat per-session price for the AI-powered marketplace practitioners (see isAiPowered in
 * scheduling.ts) — replaces per-minute wallet metering for them, since an instant Gemini reply
 * has none of the "the practitioner's time is the scarce resource" logic that per-minute billing
 * exists to model. Instead the price is a one-time reflection of how senior/trusted the profile
 * is: a base rate scaled up by years of experience and verification tier, then nudged by their
 * track record once they have enough reviews to mean something (fewer than 3 published reviews is
 * too noisy to react to — a single 5-star or 1-star review shouldn't swing the price). Deliberately
 * mirrors the site's existing AI-reading price ladder (₹99–₹349 in ai-readings.ts): same floor,
 * capped well below the priciest 1:1 reading since this is an open-ended chat, not a report. */
export function computeFixedSessionPrice({ experienceYears, verificationLevel, featured, rating, reviewCount }: {
  experienceYears: number;
  verificationLevel: string;
  featured: boolean;
  rating: number | null;
  reviewCount: number;
}): number {
  let price = 149;
  price += Math.min(experienceYears, 25) * 8;
  if (verificationLevel === "senior-panel") price += 100;
  if (featured) price += 50;
  if (rating !== null && reviewCount >= 3) {
    price += Math.max(0, rating - 3.5) * 60;
    price += Math.min(reviewCount, 50) * 2;
  }
  return Math.min(999, Math.max(149, Math.round(price / 10) * 10));
}

/** Presents the flat session price as a discount off a higher "worth" anchor — same marketing
 * convention the site already uses for the AI reading ladder (AI_PALM_READING_ORIGINAL_PRICE in
 * ai-readings.ts: ₹999 struck through, ₹349 charged). Doesn't change what's actually billed
 * (chat.ts still charges exactly `price`); this only computes what to show crossed out next to it,
 * so every AI practitioner's profile/card reads as an obvious bargain instead of a bare number.
 * The discount is deterministic per practitioner (seeded by slug, not randomized per render) so it
 * stays the same on every page load and deploy, but still varies practitioner-to-practitioner
 * within the requested 50-80% band rather than showing an identical "70% OFF" on every single card.
 * discountPercent is recomputed from the final rounded originalPrice rather than reused as-is, so
 * the displayed percentage always exactly matches the two displayed rupee figures — the rounding
 * step can shift it by a point or two from the seed target, and a mismatch there is exactly the
 * class of bug already fixed once in this codebase (see marketplace.ts's rating-rounding fix). */
export function computeSessionPriceAnchor(price: number, slug: string): { originalPrice: number; discountPercent: number } {
  const hash = Array.from(slug).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const targetDiscount = 50 + (hash % 31); // 50-80 inclusive
  const originalPrice = Math.max(price + 10, Math.round(price / (1 - targetDiscount / 100) / 10) * 10);
  const discountPercent = Math.round((1 - price / originalPrice) * 100);
  return { originalPrice, discountPercent };
}
