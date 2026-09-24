import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AI personas on the live Firestore path.
 *
 * 32 of the 34 seeded practitioners are AI personas, and every one is seeded with weekday
 * 09:30-17:30 availability. Until this change the booking flow offered them for paid, scheduled
 * one-to-one consultations — and pre-selected the first slot's practitioner, so the default path
 * through /book sold a consultation nobody could attend. These run against the Firestore emulator
 * using the real seeded roster; see synthetic-reviews.firestore.test.ts for how to run them.
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
const member = { id: "member-ai-itest", name: "Asha Test", email: "asha-ai-itest@example.test" };
vi.mock("@/lib/member-auth", () => ({ getCurrentMember: async () => member }));

const { db } = await import("@/lib/firestore");
const { getAvailableSlots, getPractitionerDirectory } = await import("@/lib/scheduling");
const { getMarketplacePractitioners } = await import("@/lib/marketplace");
const { getSeniorAstrologers } = await import("@/lib/homepage");
const { seedServices } = await import("@/lib/services");
const { POST } = await import("@/app/api/bookings/route");

const AI_PERSONA = "anika-sharma";
const HUMANS = new Set(["jagmohan-shashtri-ji", "arun-dubey-ji"]);

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

/** A Tuesday-to-Friday date comfortably in the future, when every seeded rule set is open. */
function upcomingWeekday(): string {
  const date = new Date(Date.now() + 3 * 86_400_000);
  while (![2, 3, 4, 5].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function anyServiceId(): Promise<string> {
  await seedServices();
  const snap = await db.collection("services").where("active", "==", true).limit(1).get();
  if (snap.empty) throw new Error("seedServices produced no active service");
  return snap.docs[0].id;
}

describeFirestore("AI personas on the live Firestore path", () => {
  beforeEach(clearEmulator);
  afterAll(clearEmulator);

  it("seeds the roster this test depends on", async () => {
    const directory = await getPractitionerDirectory(true);
    expect(directory.find((person) => person.id === AI_PERSONA)?.isAiPowered).toBe(true);
    expect(directory.filter((person) => HUMANS.has(person.id)).every((person) => !person.isAiPowered)).toBe(true);
  });

  describe("scheduled consultations", () => {
    it("offers no slot with an AI persona", async () => {
      const directory = await getPractitionerDirectory(true);
      const ai = new Set(directory.filter((person) => person.isAiPowered).map((person) => person.id));
      const { slots } = await getAvailableSlots({ date: upcomingWeekday(), duration: 60 });

      expect(ai.size).toBeGreaterThan(0);
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.filter((slot) => ai.has(slot.practitionerId))).toEqual([]);
    });

    it("still offers the human astrologers", async () => {
      const { slots } = await getAvailableSlots({ date: upcomingWeekday(), duration: 60 });
      expect(slots.some((slot) => HUMANS.has(slot.practitionerId))).toBe(true);
    });

    it("offers nothing when an AI persona is asked for directly", async () => {
      const { slots } = await getAvailableSlots({ date: upcomingWeekday(), duration: 60, practitionerId: AI_PERSONA });
      expect(slots).toEqual([]);
    });

    it("refuses to book an AI persona through the API, and says why", async () => {
      // The roster exists in production; beforeEach wiped it here.
      await getPractitionerDirectory(true);
      const serviceId = await anyServiceId();
      const date = upcomingWeekday();
      const response = await POST(new Request("https://example.test/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceId,
          practitionerId: AI_PERSONA,
          bookingDate: date,
          scheduledAt: `${date}T06:00:00.000Z`,
          birthDate: "1990-01-01",
          birthTime: "10:00",
          birthPlace: "Delhi",
        }),
      }));

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("is an AI astrologer available by instant chat") });
      expect((await db.collection("bookings").get()).size).toBe(0);
    });
  });

  describe("what customers are told", () => {
    it("marks AI personas on the marketplace", async () => {
      const people = await getMarketplacePractitioners();
      expect(people.find((person) => person.id === AI_PERSONA)?.isAiPowered).toBe(true);
    });

    it("lists only human astrologers as 'our most senior astrologers'", async () => {
      const seniors = await getSeniorAstrologers(10);
      expect(seniors.length).toBeGreaterThan(0);
      expect(seniors.every((person) => !person.isAiPowered)).toBe(true);
    });
  });
});
