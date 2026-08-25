/** New/unreviewed practitioners are discounted to encourage first bookings; once a practitioner
 * has enough published reviews to establish trust, they charge their full listed rate. Used by
 * both the marketplace display price (marketplace.ts) and the actual instant-chat charge
 * (chat.ts) so what's shown on a practitioner's card is exactly what gets billed. Only applies to
 * the real (non-AI) practitioners' per-minute rate — the AI-powered ones use a flat session price
 * (see computeTieredSessionPrices below) that already folds reviews into the number directly. */
export function reviewDiscountPercent(reviewCount: number): number {
  if (reviewCount === 0) return 30;
  if (reviewCount < 10) return 20;
  if (reviewCount < 25) return 10;
  return 0;
}

/** The 4 price bands every AI-powered practitioner's flat session price is drawn from, and the
 * share of the whole AI-powered roster each band should hold — cheapest band first. Rounding a
 * percentage share against a roster size that doesn't divide evenly (e.g. 60% of 32 = 19.2) is
 * handled by the largest-remainder method in computeTieredSessionPrices, so the counts always sum
 * to exactly the roster size instead of drifting by rounding error. */
const SESSION_PRICE_TIERS: { min: number; max: number; share: number }[] = [
  { min: 49, max: 149, share: 0.6 },
  { min: 151, max: 249, share: 0.2 },
  { min: 251, max: 349, share: 0.1 },
  { min: 351, max: 549, share: 0.1 },
];

/** Rounds toward the nearest "charm" price ending in 9 (₹49, ₹99, ₹149, …) — the common Indian
 * retail convention this site already uses elsewhere (AI_PALM_READING price ladder). */
function toCharmPrice(value: number): number {
  return Math.round(value / 10) * 10 - 1;
}

/** Assigns every AI-powered practitioner (see isAiPowered in scheduling.ts) a flat instant-chat
 * price between ₹49 and ₹549, ranked by review-rating experience — the lowest-rated (or entirely
 * unreviewed) practitioners land in the cheapest ₹49-149 band, the best-reviewed in the priciest
 * ₹351-549 band, with a smooth gradient in between. This replaces per-minute wallet metering for
 * them, since an instant Gemini reply has none of the "the practitioner's time is the scarce
 * resource" logic that per-minute billing exists to model.
 *
 * Deliberately a batch operation over the *whole* AI-powered roster rather than a per-practitioner
 * formula: the brief ("60% of 32 practitioners between ₹49-149, 20% between ₹151-249, …") is a
 * statement about the distribution across the cohort, not a rule that could be evaluated for one
 * practitioner in isolation — a rating-threshold formula would put far more than 60% of the roster
 * in the cheap band the moment ratings cluster tightly around 4-4.5 stars, which they do in
 * practice (see review-seed-data.ts's rollRating, biased toward 4-5 stars). Ranking by position
 * within the cohort instead of by absolute rating value is the only way to actually hit the
 * requested percentages regardless of how the underlying ratings are distributed.
 *
 * Both marketplace.ts (what's shown on a card) and chat.ts (what's actually billed at checkout)
 * must land on the exact same number for a given practitioner — chat.ts achieves that by reading
 * the same cached getMarketplacePractitioners() list this feeds, rather than recomputing pricing
 * itself (see startChatSession's fixed-price branch). */
export function computeTieredSessionPrices(practitioners: { id: string; rating: number | null; reviewCount: number }[]): Map<string, number> {
  const n = practitioners.length;
  const prices = new Map<string, number>();
  if (n === 0) return prices;

  // Ascending by rating — unreviewed/lowest-rated practitioners are least "proven", so they anchor
  // the cheap end. Tie-broken by review count (fewer reviews = less proven, even at an equal
  // rating), then id, so the ordering — and therefore every price — is fully deterministic.
  const sorted = [...practitioners].sort((a, b) => {
    const ratingDiff = (a.rating ?? -1) - (b.rating ?? -1);
    if (ratingDiff !== 0) return ratingDiff;
    if (a.reviewCount !== b.reviewCount) return a.reviewCount - b.reviewCount;
    return a.id.localeCompare(b.id);
  });

  const rawCounts = SESSION_PRICE_TIERS.map((tier) => tier.share * n);
  const counts = rawCounts.map(Math.floor);
  const assigned = counts.reduce((sum, count) => sum + count, 0);
  const byRemainderDesc = rawCounts
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < n - assigned; i++) counts[byRemainderDesc[i].index] += 1;

  let rank = 0;
  for (let tierIndex = 0; tierIndex < SESSION_PRICE_TIERS.length; tierIndex++) {
    const tier = SESSION_PRICE_TIERS[tierIndex];
    const count = counts[tierIndex];
    for (let withinTier = 0; withinTier < count; withinTier++) {
      // Spreads linearly across the band by rank-within-band, so price keeps climbing with rating
      // even inside one band rather than only jumping at band boundaries.
      const t = count <= 1 ? 0 : withinTier / (count - 1);
      const raw = tier.min + t * (tier.max - tier.min);
      const price = Math.min(tier.max, Math.max(tier.min, toCharmPrice(raw)));
      prices.set(sorted[rank].id, price);
      rank += 1;
    }
  }
  return prices;
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
