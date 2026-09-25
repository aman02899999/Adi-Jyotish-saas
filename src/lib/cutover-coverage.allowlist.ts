/**
 * Code that still uses Firestore without consulting the cutover flag, checked by
 * cutover-coverage.test.ts. Every entry must be ported, or given a reason it should stay, before
 * SUPABASE_CUTOVER is switched on (docs/supabase-migration.md, phase 4). Remove an entry when you
 * port it; the test fails until you do.
 */
const NOT_YET_PORTED = "Not yet ported.";

export const FIRESTORE_ONLY: Record<string, string> = {
  "src/lib/analytics.ts#getAnalytics": NOT_YET_PORTED,
  "src/lib/experiments.ts#getExperimentReport": NOT_YET_PORTED,
  "src/lib/experiments.ts#recordExperimentConversion": NOT_YET_PORTED,
  "src/lib/experiments.ts#recordExperimentImpression": NOT_YET_PORTED,
  "src/lib/gemstone-recommendations.ts#createGemstoneRecommendation": NOT_YET_PORTED,
  "src/lib/gemstone-reviews.ts#getAllReviewsAdmin": NOT_YET_PORTED,
  "src/lib/gemstone-wishlist.ts#getWishlistProductIds": NOT_YET_PORTED,
  "src/lib/gemstone-wishlist.ts#getWishlistWithProducts": NOT_YET_PORTED,
  "src/lib/gemstone-wishlist.ts#notifyWishlistedMembers": NOT_YET_PORTED,
  "src/lib/gemstone-wishlist.ts#toggleWishlist": NOT_YET_PORTED,
  "src/lib/gemstones-seed.ts#seedGemstoneCatalog": NOT_YET_PORTED,
  "src/lib/gemstones.ts#getAllProductsAdmin": NOT_YET_PORTED,
  "src/lib/scheduling.ts#seedPractitioners": "By design: seeds the Firestore roster; getPractitionerDirectory returns before calling it under cutover, where the roster was copied.",
};
