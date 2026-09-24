import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Synthetic reviews on the path production actually runs: Firestore.
 *
 * Every other test of these functions mocks Firestore, and a mock cannot tell you whether a query
 * returns what the code assumes. These run against the Firestore emulator and are skipped without
 * it:
 *
 *   firebase emulators:start --project=demo-jyotish --only firestore
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-jyotish \
 *     npx vitest run src/lib/synthetic-reviews.firestore.test.ts
 *
 * The first assertion is the one that matters most. An unproven practitioner is meant to charge up
 * to 30% less until they have 25 genuine reviews; a batch of 30 synthetic reviews used to remove
 * that discount entirely, so members paid about 43% more than the pricing policy said.
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-jyotish";
// The CI job that exists to run these sets REQUIRE_FIRESTORE_EMULATOR, so an emulator that failed
// to start fails the job instead of letting every suite self-skip to a green tick — the way 443
// Postgres tests once went unexecuted for months while CI reported success.
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "true" && !EMULATOR) {
  throw new Error("REQUIRE_FIRESTORE_EMULATOR is set but FIRESTORE_EMULATOR_HOST is not — the emulator did not start.");
}
const describeFirestore = EMULATOR ? describe : describe.skip;

// Next's data cache needs a request context; outside one, these behave as plain function calls.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const { db } = await import("@/lib/firestore");
const { getMarketplacePractitioner, getMarketplacePractitioners } = await import("@/lib/marketplace");
const { getHomepageStats, getFeaturedTestimonials } = await import("@/lib/homepage");
const { countGenuinePublishedReviews, purgeSyntheticReviews } = await import("@/lib/synthetic-reviews");
const { getPractitionerReviews, getPractitionerStats } = await import("@/lib/practitioner-portal");

const HUMAN = "itest-human-practitioner";

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

async function seedHumanPractitioner() {
  await db.collection("practitioners").doc(HUMAN).set({
    name: "Itest Human",
    slug: HUMAN,
    email: `${HUMAN}@example.test`,
    title: "Vedic astrologer",
    bio: "Test practitioner.",
    specialties: "Career",
    languages: "Hindi, English",
    consultationModes: "chat",
    experienceYears: 5,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    online: true,
    isAiPowered: false,
    chatRatePerMinute: 100,
    active: true,
    featured: false,
    isDemoAccount: false,
    firebaseUid: null,
  });
}

type ReviewInput = { rating: number; source?: string; body?: string; createdAt?: Date; status?: string };

async function addReviews(practitionerId: string, reviews: ReviewInput[]) {
  const batch = db.batch();
  reviews.forEach((review, index) => {
    batch.set(db.collection("practitionerReviews").doc(), {
      practitionerId,
      memberId: review.source === "seed" ? null : `member-${index}`,
      bookingId: `booking-${practitionerId}-${index}-${review.source ?? "genuine"}`,
      reviewerName: review.source === "seed" ? `Invented Name ${index}` : `Real Client ${index}`,
      rating: review.rating,
      clarity: review.rating,
      empathy: review.rating,
      usefulness: review.rating,
      body: review.body ?? "A long enough review body to be eligible as a homepage testimonial here.",
      status: review.status ?? "published",
      // Genuine reviews written before provenance existed carry no source at all — the case a
      // Firestore `!=` query would silently drop, so it is the one exercised here.
      ...(review.source ? { source: review.source } : {}),
      createdAt: review.createdAt ?? new Date(),
      updatedAt: review.createdAt ?? new Date(),
    });
  });
  await batch.commit();
}

const synthetic = (count: number, rating = 5): ReviewInput[] => Array.from({ length: count }, () => ({ rating, source: "seed" }));

describeFirestore("synthetic reviews on the live Firestore path", () => {
  beforeEach(async () => {
    await clearEmulator();
    await seedHumanPractitioner();
  });
  afterAll(clearEmulator);

  describe("pricing", () => {
    it("keeps the new-practitioner discount when every review is synthetic", async () => {
      await addReviews(HUMAN, synthetic(30));
      const person = (await getMarketplacePractitioners()).find((p) => p.id === HUMAN);

      expect(person?.reviewCount).toBe(0);
      expect(person?.reviewDiscountPercent).toBe(30);
      expect(person?.discountedRatePerMinute).toBe(70);
    });

    it("counts only genuine reviews toward the discount threshold", async () => {
      // 24 genuine is one short of the 25 that ends the discount; 30 synthetic on top would have
      // cleared it.
      await addReviews(HUMAN, [...Array.from({ length: 24 }, () => ({ rating: 4 })), ...synthetic(30)]);
      const person = (await getMarketplacePractitioners()).find((p) => p.id === HUMAN);

      expect(person?.reviewCount).toBe(24);
      expect(person?.reviewDiscountPercent).toBe(10);
    });

    it("bills chat from the genuine count, the same one the card shows", async () => {
      await addReviews(HUMAN, [{ rating: 5 }, { rating: 4, source: "member" }, ...synthetic(30)]);
      expect(await countGenuinePublishedReviews(HUMAN)).toBe(2);
    });

    it("does not count hidden genuine reviews toward pricing", async () => {
      await addReviews(HUMAN, [{ rating: 5 }, { rating: 5, status: "hidden" }]);
      expect(await countGenuinePublishedReviews(HUMAN)).toBe(1);
    });
  });

  describe("what customers see", () => {
    it("rates a practitioner from genuine reviews only", async () => {
      await addReviews(HUMAN, [{ rating: 5 }, { rating: 3 }, ...synthetic(40, 5)]);
      const person = (await getMarketplacePractitioners()).find((p) => p.id === HUMAN);

      expect(person?.rating).toBe(4);
      expect(person?.reviewCount).toBe(2);
    });

    it("shows no rating at all rather than a synthetic one", async () => {
      await addReviews(HUMAN, synthetic(35, 5));
      const person = (await getMarketplacePractitioners()).find((p) => p.id === HUMAN);
      expect(person?.rating).toBeNull();
    });

    it("lists only genuine reviews on the profile page", async () => {
      await addReviews(HUMAN, [{ rating: 4 }, ...synthetic(10)]);
      const result = await getMarketplacePractitioner(HUMAN);

      expect(result?.reviews).toHaveLength(1);
      expect(result?.reviews[0].reviewerName).toBe("Real Client 0");
    });

    it("computes the homepage average and review count from genuine reviews", async () => {
      await addReviews(HUMAN, [{ rating: 4 }, { rating: 2 }, ...synthetic(50, 5)]);
      const stats = await getHomepageStats();

      expect(stats.averageRating).toBe(3);
      expect(stats.reviewCount).toBe(2);
    });

    it("finds a genuine testimonial even when synthetic ones outrank it", async () => {
      // Synthetic reviews are newer and all 5-star, so they fill the first several pages of the
      // (rating desc, createdAt desc) ordering. A single top-N query would come back empty.
      const older = new Date(Date.now() - 86_400_000);
      await addReviews(HUMAN, [
        { rating: 5, createdAt: older, body: "Genuinely helpful consultation, clear and patient throughout the session." },
        ...synthetic(60, 5),
      ]);
      const testimonials = await getFeaturedTestimonials(1);

      expect(testimonials).toEqual([
        { reviewerName: "Real Client 0", body: "Genuinely helpful consultation, clear and patient throughout the session.", rating: 5 },
      ]);
    });

    it("never quotes a synthetic review as a testimonial", async () => {
      await addReviews(HUMAN, synthetic(20, 5));
      expect(await getFeaturedTestimonials(3)).toEqual([]);
    });
  });

  describe("the practitioner's own portal", () => {
    it("shows the practitioner only feedback clients actually gave", async () => {
      await addReviews(HUMAN, [{ rating: 3 }, ...synthetic(30, 5)]);
      const [stats, reviews] = await Promise.all([getPractitionerStats(HUMAN), getPractitionerReviews(HUMAN)]);

      expect(stats.reviewCount).toBe(1);
      expect(stats.avgRating).toBe(3);
      expect(reviews).toHaveLength(1);
    });
  });

  describe("purge", () => {
    it("deletes every synthetic review and nothing else", async () => {
      await addReviews(HUMAN, [{ rating: 4 }, { rating: 5, source: "member" }, ...synthetic(30)]);
      expect(await purgeSyntheticReviews()).toBe(30);

      const remaining = await db.collection("practitionerReviews").get();
      expect(remaining.size).toBe(2);
      expect(remaining.docs.every((doc) => doc.data().source !== "seed")).toBe(true);
    });

    it("works through more than one delete batch", async () => {
      // One Firestore batch caps at 500 writes and the purge uses 450, so 1,000 forces three rounds.
      for (let i = 0; i < 4; i += 1) await addReviews(HUMAN, synthetic(250));
      expect(await purgeSyntheticReviews()).toBe(1000);
      expect((await db.collection("practitionerReviews").get()).size).toBe(0);
    });

    it("expires every cache derived from reviews", async () => {
      const { revalidateTag } = await import("next/cache");
      vi.mocked(revalidateTag).mockClear();
      await purgeSyntheticReviews();

      const tags = vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag);
      expect(tags).toEqual(expect.arrayContaining(["homepage-stats", "homepage-testimonials", "marketplace-practitioners"]));
    });

    it("reports zero and deletes nothing when there are none", async () => {
      await addReviews(HUMAN, [{ rating: 5 }]);
      expect(await purgeSyntheticReviews()).toBe(0);
      expect((await db.collection("practitionerReviews").get()).size).toBe(1);
    });
  });
});
