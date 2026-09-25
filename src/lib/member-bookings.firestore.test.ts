import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The dashboard's "next session" card on the live Firestore path. It told members a session "is
 * reserved" when they had cancelled it: the query took the first upcoming booking whatever its
 * status. Runs against the Firestore emulator; see synthetic-reviews.firestore.test.ts for how.
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-jyotish";
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "true" && !EMULATOR) {
  throw new Error("REQUIRE_FIRESTORE_EMULATOR is set but FIRESTORE_EMULATOR_HOST is not — the emulator did not start.");
}
const describeFirestore = EMULATOR ? describe : describe.skip;

const { db } = await import("@/lib/firestore");
const { getNextMemberBooking, listMemberBookings } = await import("@/lib/member-bookings");

const EMAIL = "asha-next@example.test";

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

async function booking(id: string, hoursFromNow: number, status: string, clientEmail = EMAIL) {
  await db.collection("bookings").doc(id).set({
    reference: id, serviceTitle: "Reading", servicePrice: 1500, serviceDuration: 30, practitionerId: "p", practitionerName: "P",
    clientName: "Asha", clientEmail, birthDate: "1990-01-01", birthTime: "10:00", birthPlace: "Delhi",
    scheduledAt: new Date(Date.now() + hoursFromNow * 3_600_000), status, paymentStatus: "paid", createdAt: new Date(), updatedAt: new Date(),
  });
}

describeFirestore("a member's bookings on the live Firestore path", () => {
  beforeEach(clearEmulator);
  afterAll(clearEmulator);

  it("shows the next session, skipping one the member cancelled", async () => {
    await booking("cancelled-sooner", 24, "cancelled");
    await booking("still-on", 48, "confirmed");
    expect((await getNextMemberBooking(EMAIL))?.id).toBe("still-on");
  });

  it("shows no next session when every upcoming one is cancelled", async () => {
    await booking("cancelled-only", 24, "cancelled");
    expect(await getNextMemberBooking(EMAIL)).toBeNull();
  });

  it("lists only the member's own bookings, newest appointment first", async () => {
    await booking("past", -48, "completed");
    await booking("future", 48, "confirmed");
    await booking("someone-else", 24, "confirmed", "someone@example.test");
    expect((await listMemberBookings(EMAIL)).map((b) => b.id)).toEqual(["future", "past"]);
  });
});
