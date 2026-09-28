import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Pre-session reminders on the live Firestore path. Runs against the emulator; see
 * synthetic-reviews.firestore.test.ts for how.
 */
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-jyotish";
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "true" && !EMULATOR) {
  throw new Error("REQUIRE_FIRESTORE_EMULATOR is set but FIRESTORE_EMULATOR_HOST is not — the emulator did not start.");
}
const describeFirestore = EMULATOR ? describe : describe.skip;

const { db } = await import("@/lib/firestore");
const reminders = await import("@/lib/booking-reminders");

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

const NOW = new Date(Date.UTC(2031, 6, 15, 6, 0));
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

async function book(id: string, scheduledAt: Date, { status = "confirmed", createdAt = hours(-48) } = {}) {
  await db.collection("bookings").doc(id).set({
    reference: `JY-${id}`,
    serviceTitle: "Test reading",
    practitionerName: "Test astrologer",
    clientName: "Test client",
    clientEmail: `${id}@example.test`,
    scheduledAt,
    status,
    createdAt,
  });
}

const claimIds = async () => (await reminders.claimDueBookingReminders(NOW)).map((row) => row.id).sort();

describeFirestore("booking reminders on the live Firestore path", () => {
  beforeEach(clearEmulator);
  afterAll(clearEmulator);

  it("claims only upcoming, live, not-just-made bookings inside the next day, once", async () => {
    await book("due", hours(3));
    await book("pending", hours(20), { status: "pending" });
    await book("edge", hours(24));
    await book("later", hours(30));
    await book("past", hours(-2));
    await book("cancelled", hours(5), { status: "cancelled" });
    await book("completed", hours(5), { status: "completed" });
    await book("fresh", hours(5), { createdAt: hours(-0.5) });

    const rows = await reminders.claimDueBookingReminders(NOW);
    expect(rows.map((row) => row.id).sort()).toEqual(["due", "edge", "pending"]);
    expect(rows.find((row) => row.id === "due")).toMatchObject({
      reference: "JY-due",
      serviceTitle: "Test reading",
      practitionerName: "Test astrologer",
      clientName: "Test client",
      clientEmail: "due@example.test",
      scheduledAt: hours(3),
    });
    expect(await claimIds()).toEqual([]);
  });

  it("makes a rescheduled booking due again for its new time", async () => {
    await book("moved", hours(4));
    expect(await claimIds()).toEqual(["moved"]);
    await db.collection("bookings").doc("moved").update({ scheduledAt: hours(10) });
    expect(await claimIds()).toEqual(["moved"]);
    expect(await claimIds()).toEqual([]);
  });

  it("hands each booking to exactly one of several overlapping runs", async () => {
    const ids = Array.from({ length: 6 }, (_, i) => `race${i}`);
    for (const [i, id] of ids.entries()) await book(id, hours(1 + i));
    const runs = await Promise.all(Array.from({ length: 4 }, () => claimIds()));
    expect(runs.flat().sort()).toEqual(ids);
  });

  it("posts the reminder in the member's booking thread", async () => {
    await db.collection("members").doc("m1").set({ email: "due@example.test", name: "Test client" });
    await book("due", hours(3));
    const result = await reminders.sendDueBookingReminders(NOW);
    expect(result).toMatchObject({ claimed: 1, messaged: 1, failed: 0 });
    const threads = await db.collection("messageThreads").where("memberId", "==", "m1").where("bookingId", "==", "due").get();
    expect(threads.size).toBe(1);
  });
});
