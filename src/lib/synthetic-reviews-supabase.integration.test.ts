import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * Synthetic reviews on the Postgres path. The Firestore behaviour is proven against the emulator
 * in synthetic-reviews.firestore.test.ts; this is the same set of guarantees for the database
 * behind the cutover flag, so neither provider can drift from the other.
 *
 * Skipped unless SUPABASE_DB_URL points at a database carrying the migration schema, and the
 * provider-routing cases additionally need SUPABASE_CUTOVER=true.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));

const {
  getAllReviewsInSupabase,
  getPublishedReviewsForPractitionerInSupabase,
  getPublishedReviewsInSupabase,
} = await import("@/lib/practitioners-supabase");
const { countPublishedPractitionerReviewsFromSupabase } = await import("@/lib/chat-supabase");
const { getPortalStatsInSupabase } = await import("@/lib/practitioner-portal-supabase");
const { countGenuinePublishedReviews, purgeSyntheticReviews } = await import("@/lib/synthetic-reviews");

const PRACTITIONER = "prac-synth-itest";
const OTHER = "prac-synth-other-itest";

async function reset() {
  await query(`delete from public.practitioner_reviews where practitioner_id = any($1::text[])`, [[PRACTITIONER, OTHER]]);
  await query(`delete from public.practitioners where id = any($1::text[])`, [[PRACTITIONER, OTHER]]);
  for (const id of [PRACTITIONER, OTHER]) {
    await query(
      `insert into public.practitioners (id, name, slug, email, active) values ($1, $1, $1, $2, true)`,
      [id, `${id}@example.test`],
    );
  }
}

let seq = 0;
async function addReview(practitionerId: string, rating: number, source: string | null, status = "published") {
  seq += 1;
  await query(
    `insert into public.practitioner_reviews
       (id, practitioner_id, reviewer_name, rating, clarity, empathy, usefulness, body, status, source)
     values ($1, $2, $3, $4, $4, $4, $4, 'body', $5, $6)`,
    [`rev-synth-itest-${seq}`, practitionerId, source === "seed" ? "Invented" : "Real client", rating, status, source],
  );
}

async function seedMixed() {
  // Genuine with no source (how every review written before provenance looks), genuine stamped
  // "member", and synthetic. A null source is the case `source <> 'seed'` alone would drop.
  await addReview(PRACTITIONER, 5, null);
  await addReview(PRACTITIONER, 3, "member");
  for (let i = 0; i < 30; i += 1) await addReview(PRACTITIONER, 5, "seed");
}

describeDb("synthetic reviews on Postgres", () => {
  beforeEach(reset);
  afterAll(async () => {
    await query(`delete from public.practitioner_reviews where practitioner_id = any($1::text[])`, [[PRACTITIONER, OTHER]]);
    await query(`delete from public.practitioners where id = any($1::text[])`, [[PRACTITIONER, OTHER]]);
    await closePgPool();
  });

  it("excludes synthetic reviews from the marketplace-wide read", async () => {
    await seedMixed();
    const mine = (await getPublishedReviewsInSupabase()).filter((row) => row.practitionerId === PRACTITIONER);
    expect(mine).toHaveLength(2);
    expect(mine.every((row) => row.source !== "seed")).toBe(true);
  });

  it("keeps genuine reviews whose source is null", async () => {
    await addReview(PRACTITIONER, 4, null);
    expect(await getPublishedReviewsForPractitionerInSupabase(PRACTITIONER)).toHaveLength(1);
  });

  it("excludes synthetic reviews from a practitioner's profile", async () => {
    await seedMixed();
    expect(await getPublishedReviewsForPractitionerInSupabase(PRACTITIONER)).toHaveLength(2);
  });

  it("excludes synthetic reviews from the count that sets chat pricing", async () => {
    await seedMixed();
    expect(await countPublishedPractitionerReviewsFromSupabase(PRACTITIONER)).toBe(2);
  });

  it("excludes synthetic reviews from the practitioner's own portal stats", async () => {
    await seedMixed();
    const stats = await getPortalStatsInSupabase(PRACTITIONER);
    expect(stats.reviewCount).toBe(2);
    expect(stats.avgRating).toBe(4);
  });

  it("still shows every review, labelled, to admins", async () => {
    await seedMixed();
    const mine = (await getAllReviewsInSupabase()).filter((row) => row.practitionerId === PRACTITIONER);
    expect(mine).toHaveLength(32);
    expect(mine.filter((row) => row.source === "seed")).toHaveLength(30);
  });

  describeCutover("routed through the provider switch", () => {
    it("bills from the genuine count", async () => {
      await seedMixed();
      expect(await countGenuinePublishedReviews(PRACTITIONER)).toBe(2);
    });

    it("purges only synthetic reviews, across every practitioner", async () => {
      await seedMixed();
      await addReview(OTHER, 5, "seed");
      await addReview(OTHER, 2, null);

      expect(await purgeSyntheticReviews()).toBe(31);
      const left = await query<{ source: string | null }>(
        `select source from public.practitioner_reviews where practitioner_id = any($1::text[])`,
        [[PRACTITIONER, OTHER]],
      );
      expect(left.rowCount).toBe(3);
      expect(left.rows.every((row) => row.source !== "seed")).toBe(true);
    });
  });
});
