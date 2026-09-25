/**
 * Code that still uses Firestore without consulting the cutover flag, checked by
 * cutover-coverage.test.ts. Every entry must be ported, or given a reason it should stay, before
 * SUPABASE_CUTOVER is switched on (docs/supabase-migration.md, phase 4). Remove an entry when you
 * port it; the test fails until you do.
 *
 * Entries under gemini.ts all reach Firestore through the daily spending cap (geminiUsage): once
 * Firestore is retired, that budget check fails, however the call sites handle it.
 */
const NOT_YET_PORTED = "Not yet ported.";

export const FIRESTORE_ONLY: Record<string, string> = {
  "src/app/[locale]/admin/(protected)/activity/page.tsx": NOT_YET_PORTED,
  "src/app/[locale]/admin/(protected)/members/page.tsx": NOT_YET_PORTED,
  "src/app/[locale]/admin/(protected)/messages/page.tsx": NOT_YET_PORTED,
  "src/app/[locale]/admin/(protected)/schedule/page.tsx": NOT_YET_PORTED,
  "src/app/[locale]/admin/(protected)/settings/page.tsx": NOT_YET_PORTED,
  "src/app/api/admin/invites/[id]/route.ts": NOT_YET_PORTED,
  "src/lib/analytics.ts#getAnalytics": NOT_YET_PORTED,
  "src/lib/astro-journal.ts#listJournalEntries": NOT_YET_PORTED,
  "src/lib/astro-journal.ts#logJournalEntry": NOT_YET_PORTED,
  "src/lib/cosmic-profile-card.ts#getCosmicProfileCard": NOT_YET_PORTED,
  "src/lib/cosmic-profile-card.ts#upsertCosmicProfileCard": NOT_YET_PORTED,
  "src/lib/experiments.ts#getExperimentReport": NOT_YET_PORTED,
  "src/lib/experiments.ts#recordExperimentConversion": NOT_YET_PORTED,
  "src/lib/experiments.ts#recordExperimentImpression": NOT_YET_PORTED,
  "src/lib/gemini.ts#checkGeminiHealth": NOT_YET_PORTED,
  "src/lib/gemini.ts#getAiReadingAnswer": NOT_YET_PORTED,
  "src/lib/gemini.ts#getFaceReadingAnswer": NOT_YET_PORTED,
  "src/lib/gemini.ts#getLalKitabReadingAnswer": NOT_YET_PORTED,
  "src/lib/gemini.ts#getPalmReadingAnswer": NOT_YET_PORTED,
  "src/lib/gemini.ts#getPersonaReadingAnswer": NOT_YET_PORTED,
  "src/lib/gemini.ts#getPractitionerChatReply": NOT_YET_PORTED,
  "src/lib/gemini.ts#getTarotReadingAnswer": NOT_YET_PORTED,
  "src/lib/gemini.ts#getVastuReadingAnswer": NOT_YET_PORTED,
  "src/lib/gemstone-recommendations.ts#createGemstoneRecommendation": NOT_YET_PORTED,
  "src/lib/gemstone-reviews.ts#getAllReviewsAdmin": NOT_YET_PORTED,
  "src/lib/gemstone-wishlist.ts#getWishlistProductIds": NOT_YET_PORTED,
  "src/lib/gemstone-wishlist.ts#getWishlistWithProducts": NOT_YET_PORTED,
  "src/lib/gemstone-wishlist.ts#notifyWishlistedMembers": NOT_YET_PORTED,
  "src/lib/gemstone-wishlist.ts#toggleWishlist": NOT_YET_PORTED,
  "src/lib/gemstones-seed.ts#seedGemstoneCatalog": NOT_YET_PORTED,
  "src/lib/gemstones.ts#getAllProductsAdmin": NOT_YET_PORTED,
  "src/lib/gift-cards.ts#createGiftCard": NOT_YET_PORTED,
  "src/lib/gift-cards.ts#getGiftCard": NOT_YET_PORTED,
  "src/lib/gift-cards.ts#redeemGiftCard": NOT_YET_PORTED,
  "src/lib/horoscopes.ts#getDailyHoroscope": NOT_YET_PORTED,
  "src/lib/horoscopes.ts#getHoroscopeForPeriod": NOT_YET_PORTED,
  "src/lib/kundli-matching.ts#createKundliMatch": NOT_YET_PORTED,
  "src/lib/kundli-matching.ts#getKundliMatchById": NOT_YET_PORTED,
  "src/lib/kundli-matching.ts#getShareableKundliMatch": NOT_YET_PORTED,
  "src/lib/milestones.ts#checkBookingCompletionMilestone": NOT_YET_PORTED,
  "src/lib/milestones.ts#getMilestone": NOT_YET_PORTED,
  "src/lib/numerology.ts#createNumerologyReading": NOT_YET_PORTED,
  "src/lib/scheduling.ts#seedPractitioners": "By design: seeds the Firestore roster; getPractitionerDirectory returns before calling it under cutover, where the roster was copied.",
  "src/lib/streaks.ts#recordDailyVisit": NOT_YET_PORTED,
  "src/lib/transit-alerts.ts#getCosmicWeather": NOT_YET_PORTED,
};
