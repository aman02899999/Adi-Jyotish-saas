import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The admin workspace pages' reads on the live Firestore path. Runs against the emulator; see
 * synthetic-reviews.firestore.test.ts for how.
 */
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-jyotish";
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "true" && !EMULATOR) {
  throw new Error("REQUIRE_FIRESTORE_EMULATOR is set but FIRESTORE_EMULATOR_HOST is not — the emulator did not start.");
}
const describeFirestore = EMULATOR ? describe : describe.skip;

const { db } = await import("@/lib/firestore");
const dir = await import("@/lib/admin-directory");

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

describeFirestore("admin workspace reads on the live Firestore path", () => {
  beforeEach(clearEmulator);
  afterAll(clearEmulator);

  it("shows an admin whose record lacks `active` as inactive, as the sign-in gate treats them", async () => {
    await db.collection("adminUsers").doc("no-flag").set({ name: "B", email: "b@example.test", role: "support" });
    await db.collection("adminUsers").doc("on").set({ name: "A", email: "a@example.test", role: "owner", active: true });
    const users = await dir.listAdminUsersForAdmin();
    expect(users.map((u) => [u.id, u.active])).toEqual([["on", true], ["no-flag", false]]);
  });

  it("counts upcoming, non-cancelled bookings per practitioner", async () => {
    const at = (h: number) => new Date(Date.now() + h * 3_600_000);
    await db.collection("bookings").doc("1").set({ practitionerId: "a", status: "confirmed", scheduledAt: at(24) });
    await db.collection("bookings").doc("2").set({ practitionerId: "a", status: "cancelled", scheduledAt: at(48) });
    await db.collection("bookings").doc("3").set({ practitionerId: "a", status: "completed", scheduledAt: at(-24) });
    expect(await dir.countUpcomingBookingsByPractitioner()).toEqual({ a: 1 });
  });

  it("cancels a pending admin invite once", async () => {
    await db.collection("adminInvites").doc("inv").set({ email: "x@example.test" });
    expect(await dir.deleteAdminInviteById("inv")).toEqual({ email: "x@example.test" });
    expect(await dir.deleteAdminInviteById("inv")).toBeNull();
  });

  it("lists the newest audit entries first", async () => {
    await db.collection("auditLogs").add({ adminId: "a", adminName: "A", action: "old", entityType: "x", entityId: null, details: null, createdAt: new Date(Date.now() - 60_000) });
    await db.collection("auditLogs").add({ adminId: "a", adminName: "A", action: "new", entityType: "x", entityId: null, details: "{\"k\":1}", createdAt: new Date() });
    expect((await dir.listRecentAuditEntries(10)).map((e) => e.action)).toEqual(["new", "old"]);
  });
});
