import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Custom pages on the live Firestore path, whose create and update now share validation with the
 * Postgres path. Runs against the Firestore emulator; see synthetic-reviews.firestore.test.ts.
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-jyotish";
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "true" && !EMULATOR) {
  throw new Error("REQUIRE_FIRESTORE_EMULATOR is set but FIRESTORE_EMULATOR_HOST is not — the emulator did not start.");
}
const describeFirestore = EMULATOR ? describe : describe.skip;

const pages = await import("@/lib/custom-pages");

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

describeFirestore("custom pages on the live Firestore path", () => {
  beforeEach(clearEmulator);
  afterAll(clearEmulator);

  it("creates, edits, publishes and deletes a page", async () => {
    const page = await pages.createCustomPage({ title: "Vedic Remedies", metaDescription: "  About remedies. " });
    expect(page).toMatchObject({ slug: "vedic-remedies", metaDescription: "About remedies.", published: false });
    expect((await pages.createCustomPage({ title: "Vedic Remedies", metaDescription: "" })).slug).toBe("vedic-remedies-2");
    expect((await pages.createCustomPage({ title: "Home", metaDescription: "" })).slug).toBe("home-2");

    const edited = await pages.updateCustomPage(page.id, { published: true });
    expect(edited).toMatchObject({ title: "Vedic Remedies", metaDescription: "About remedies.", published: true });
    expect((await pages.getPublishedCustomPageBySlug("vedic-remedies"))?.id).toBe(page.id);
    expect(await pages.getPublishedCustomPageBySlug("vedic-remedies-2")).toBeNull();

    await expect(pages.updateCustomPage("nope", { published: true })).rejects.toThrow("not found");
    await pages.deleteCustomPage(page.id);
    await expect(pages.deleteCustomPage(page.id)).rejects.toThrow("not found");
  });
});
