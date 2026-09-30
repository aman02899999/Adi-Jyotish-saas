import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Starter services on the live Firestore path. They are written once, into an empty catalogue.
 * They used to be re-created before every catalogue read, which undid an admin's delete on the
 * next page view and cost one read per starter service on every homepage view. Each case
 * re-imports the module to stand in for a fresh server instance. See
 * synthetic-reviews.firestore.test.ts for how to run these.
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-jyotish";
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "true" && !EMULATOR) {
  throw new Error("REQUIRE_FIRESTORE_EMULATOR is set but FIRESTORE_EMULATOR_HOST is not — the emulator did not start.");
}
const describeFirestore = EMULATOR ? describe : describe.skip;

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

/** A fresh copy of the module, as a newly started server instance would load it. */
async function freshInstance() {
  vi.resetModules();
  return import("@/lib/services");
}

async function serviceIds() {
  const { db } = await import("@/lib/firestore");
  return (await db.collection("services").get()).docs.map((doc) => doc.id).sort();
}

describeFirestore("starter services on the live Firestore path", () => {
  beforeEach(clearEmulator);
  afterAll(clearEmulator);

  it("seeds an empty catalogue with the starter services", async () => {
    const { seedServices, starterServices } = await freshInstance();
    await seedServices();
    expect(await serviceIds()).toEqual(starterServices.map((service) => service.slug).sort());
  });

  it("does not bring back a starter service the admin deleted", async () => {
    const first = await freshInstance();
    await first.seedServices();
    const { db } = await import("@/lib/firestore");
    const deleted = first.starterServices[0].slug;
    await db.collection("services").doc(deleted).delete();

    const second = await freshInstance();
    await second.seedServices();
    const { getPublishedServices } = second;
    expect(await serviceIds()).not.toContain(deleted);
    expect((await getPublishedServices()).map((service) => service.slug)).not.toContain(deleted);
  });

  it("leaves a catalogue that predates the marker alone", async () => {
    const { db } = await import("@/lib/firestore");
    await db.collection("services").doc("custom-reading").set({ title: "Custom", slug: "custom-reading", active: true, featured: false, price: 100, duration: 30, category: "Custom", description: "Custom", icon: "sun" });
    const { seedServices } = await freshInstance();
    await seedServices();
    expect(await serviceIds()).toEqual(["custom-reading"]);
  });
});
