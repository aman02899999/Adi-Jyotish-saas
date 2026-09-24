/**
 * Which practitioner reviews are genuine.
 *
 * The admin panel used to be able to generate synthetic reviews — invented reviewer names,
 * invented booking ids, 30-40 per practitioner and 400-1,000 per "senior" one — stored with
 * `source: "seed"` and published straight to the public site. They were never distinguished
 * downstream, so they fed:
 *
 *   - the homepage average rating and testimonials,
 *   - every rating and review count on the astrologer marketplace and profile pages,
 *   - the practitioner's own portal, where they read as real client feedback,
 *   - and pricing. reviewDiscountPercent gives an unproven practitioner up to 30% off until they
 *     have 25 reviews; the smallest synthetic batch (30) cleared that on its own, so members paid
 *     the full rate for someone with no genuine track record. computeTieredSessionPrices ranks
 *     AI personas by rating and review count, so synthetic ratings moved them up price bands.
 *
 * Generation is gone. Rows already written stay in the database — deleting production data is the
 * owner's call, made from the admin reviews screen — but nothing a member sees or pays is derived
 * from them any more.
 *
 * Genuine reviews written before this change carry no `source` at all, which is why the test is
 * "not synthetic" rather than "is member": a Firestore `!=` query would silently drop every one of
 * them, the same trap getPractitionerDirectory documents for isDemoAccount.
 */

export const SYNTHETIC_REVIEW_SOURCE = "seed";

/** What new member-submitted reviews are stamped with, so provenance is explicit from here on. */
export const MEMBER_REVIEW_SOURCE = "member";

export function isSyntheticReview(review: { source?: string | null }): boolean {
  return review.source === SYNTHETIC_REVIEW_SOURCE;
}

export function genuineReviews<T extends { source?: string | null }>(reviews: T[]): T[] {
  return reviews.filter((review) => !isSyntheticReview(review));
}

/**
 * The same rule as a SQL predicate for the Postgres path. `coalesce` because a genuine review's
 * source is null, and `null <> 'seed'` is null — which a where clause treats as false.
 */
export const GENUINE_REVIEW_SQL = `coalesce(source, '') <> '${SYNTHETIC_REVIEW_SOURCE}'`;
