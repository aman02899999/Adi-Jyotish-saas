import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Homepage hero, footer and promo banner edits on the live Firestore path, which now shares its
 * read/write helpers with the Postgres path. Runs against the Firestore emulator; see
 * synthetic-reviews.firestore.test.ts.
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-jyotish";
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "true" && !EMULATOR) {
  throw new Error("REQUIRE_FIRESTORE_EMULATOR is set but FIRESTORE_EMULATOR_HOST is not — the emulator did not start.");
}
const describeFirestore = EMULATOR ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));

const { getFooterContent, getHomeHeroContent, updateFooterContent, updateHomeHeroContent } = await import("@/lib/site-content");
const { getPromoBanner, updatePromoBanner } = await import("@/lib/promo-banner");

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

describeFirestore("site content on the live Firestore path", () => {
  beforeEach(clearEmulator);
  afterAll(clearEmulator);

  it("shows the built-in copy, then keeps an edit field by field", async () => {
    expect((await getHomeHeroContent()).headline).toBe("Your stars.");
    await updateHomeHeroContent({ headline: "New headline", primaryCtaHref: "javascript:alert(1)" });
    await updateHomeHeroContent({ lead: "New lead" });
    expect(await getHomeHeroContent()).toMatchObject({ headline: "New headline", lead: "New lead", primaryCtaHref: "/dashboard" });
    await updateFooterContent({ blurb: "New footer" });
    expect((await getFooterContent()).blurb).toBe("New footer");
  });

  it("keeps the promo banner an admin saved", async () => {
    await updatePromoBanner({ enabled: true, message: "Diwali readings", ctaLabel: "Book", ctaHref: "/book", source: "manual", festivalKey: null });
    await updatePromoBanner({ message: "Diwali readings, now open" });
    expect(await getPromoBanner()).toMatchObject({ enabled: true, message: "Diwali readings, now open", ctaHref: "/book" });
  });
});
