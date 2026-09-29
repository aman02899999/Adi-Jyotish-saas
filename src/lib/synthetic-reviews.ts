import "server-only";

import { revalidateTag } from "next/cache";
import { db } from "@/lib/firestore";
import { countPublishedPractitionerReviewsFromSupabase } from "@/lib/chat-supabase";
import { query } from "@/lib/postgres";
import { isSyntheticReview, SYNTHETIC_REVIEW_SOURCE } from "@/lib/review-provenance";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

/** Firestore caps a write batch at 500; this leaves headroom. */
const DELETE_BATCH = 450;

/** Every cache holding something derived from practitioner reviews. */
const REVIEW_DERIVED_CACHE_TAGS = ["homepage-stats", "homepage-testimonials", "marketplace-practitioners"];

/**
 * Expires every review-derived cache immediately, so a moderation decision is live now rather than
 * after the next TTL (up to five minutes on the homepage). That matters most for the case this
 * codebase already alerts admins about: a review that leaks a phone number or email is hidden
 * because it should stop being visible, not because it should stop being visible eventually.
 */
export function expireReviewDerivedCaches(): void {
  for (const tag of REVIEW_DERIVED_CACHE_TAGS) revalidateTag(tag, { expire: 0 });
}

/**
 * Permanently deletes every synthetic review (source === "seed").
 *
 * They are already excluded from everything public and from pricing (review-provenance.ts), so
 * this is housekeeping rather than a fix — which is why it is a deliberate admin action and not
 * something run automatically against production data.
 *
 * An equality query on `source` is safe here, unlike the `!=` it would take to select genuine
 * reviews: it only has to find documents that carry the field.
 */
export async function purgeSyntheticReviews(): Promise<number> {
  let deleted: number;

  if (isSupabaseCutoverActive()) {
    const result = await query(`delete from public.practitioner_reviews where source = $1`, [SYNTHETIC_REVIEW_SOURCE]);
    deleted = result.rowCount ?? 0;
  } else {
    deleted = 0;
    const synthetic = db.collection("practitionerReviews").where("source", "==", SYNTHETIC_REVIEW_SOURCE);
    // Re-query each round rather than paging a cursor: every round deletes what it read, so the
    // next query naturally starts from whatever is left, and a crash mid-way resumes cleanly.
    for (;;) {
      const snap = await synthetic.select().limit(DELETE_BATCH).get();
      if (snap.empty) break;
      const batch = db.batch();
      for (const doc of snap.docs) batch.delete(doc.ref);
      await batch.commit();
      deleted += snap.size;
      if (snap.size < DELETE_BATCH) break;
    }
  }

  expireReviewDerivedCaches();
  return deleted;
}

/**
 * Genuine published reviews for one practitioner — the number that sets their new-practitioner
 * discount at chat checkout (reviewDiscountPercent). One function for both providers so the count
 * that bills is the count that is tested.
 *
 * A Firestore aggregate cannot express "source is not seed" without dropping every genuine review
 * that has no source field, so this reads the single field it needs and counts in code.
 */
export async function countGenuinePublishedReviews(practitionerId: string): Promise<number> {
  if (isSupabaseCutoverActive()) return countPublishedPractitionerReviewsFromSupabase(practitionerId);
  const snap = await db.collection("practitionerReviews")
    .where("practitionerId", "==", practitionerId)
    .where("status", "==", "published")
    .select("source")
    .get();
  return snap.docs.filter((doc) => !isSyntheticReview(doc.data())).length;
}
