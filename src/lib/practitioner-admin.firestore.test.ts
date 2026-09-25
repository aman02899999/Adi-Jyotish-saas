import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Practitioner management from the two admin pages, on the live Firestore path.
 *
 * The Schedule page (/api/practitioners) and the Practitioners page (/api/admin/practitioners)
 * used to carry separate implementations: the schedule permission alone could create
 * practitioners, change their rate and verification, and delete them — history and all — while
 * the Practitioners page refused to delete one with bookings, and did not record that a starter
 * was deleted, so the seed brought it straight back. Both now go through one set of functions.
 * Runs against the Firestore emulator; see synthetic-reviews.firestore.test.ts for how.
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
const session = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/lib/admin-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-auth")>()),
  getCurrentAdmin: async () => ({ id: "admin-itest", name: "Admin", email: "admin@example.test", role: "custom", permissions: session.permissions }),
  hasAdminPermission: (admin: { permissions: string[] }, permission: string) => admin.permissions.includes(permission),
  recordAudit: async () => {},
}));

const { db } = await import("@/lib/firestore");
const { getPractitionerDirectory } = await import("@/lib/scheduling");
const scheduleRoutes = { list: await import("@/app/api/practitioners/route"), one: await import("@/app/api/practitioners/[id]/route") };
const adminRoutes = { list: await import("@/app/api/admin/practitioners/route"), one: await import("@/app/api/admin/practitioners/[id]/route") };
const inviteRoute = await import("@/app/api/admin/practitioners/[id]/invite/route");
const { getPractitionerPortalProfile } = await import("@/lib/practitioner-portal");

const HUMAN = "jagmohan-shashtri-ji";
const AI = "anika-sharma";

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, body?: unknown) => new Request("https://example.test", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const stored = async (id: string) => (await db.collection("practitioners").doc(id).get()).data() as Record<string, unknown> | undefined;
const asSeen = async (id: string) => (await getPractitionerDirectory(false, true)).find((person) => person.id === id)!;

describeFirestore("practitioner management on the live Firestore path", () => {
  beforeEach(async () => {
    await clearEmulator();
    session.permissions = ["schedule", "practitioners"];
    await getPractitionerDirectory(true);
  });
  afterAll(clearEmulator);

  describe("with only the schedule permission", () => {
    beforeEach(() => { session.permissions = ["schedule"]; });

    it("can switch a human astrologer online or offline", async () => {
      const person = await asSeen(HUMAN);
      const response = await scheduleRoutes.one.PUT(json("PUT", { ...person, online: !person.online }), params(HUMAN));
      expect(response.status).toBe(200);
      expect((await stored(HUMAN))?.online).toBe(!person.online);
    });

    it("cannot change a practitioner's rate or verification", async () => {
      const person = await asSeen(HUMAN);
      const response = await scheduleRoutes.one.PUT(json("PUT", { ...person, chatRatePerMinute: 1, verified: false }), params(HUMAN));

      expect(response.status).toBe(403);
      expect(await stored(HUMAN)).toMatchObject({ chatRatePerMinute: person.chatRatePerMinute, verified: person.verified });
    });

    it("cannot add or remove practitioners", async () => {
      const created = await scheduleRoutes.list.POST(json("POST", { name: "New Person", email: "new@example.test", bio: "A long enough biography." }));
      expect(created.status).toBe(403);
      expect((await scheduleRoutes.one.DELETE(json("DELETE"), params(AI))).status).toBe(403);
      expect(await stored(AI)).toBeDefined();
    });
  });

  describe("one set of rules on both pages", () => {
    it("refuses to delete a practitioner with bookings, from either page", async () => {
      await db.collection("bookings").doc("history").set({ practitionerId: HUMAN, scheduledAt: new Date(), status: "completed" });

      const fromSchedule = await scheduleRoutes.one.DELETE(json("DELETE"), params(HUMAN));
      const fromAdmin = await adminRoutes.one.DELETE(json("DELETE"), params(HUMAN));
      expect(fromSchedule.status).toBe(409);
      await expect(fromSchedule.json()).resolves.toMatchObject({ error: expect.stringContaining("deactivate instead") });
      expect(fromAdmin.status).toBe(400);
      expect(await stored(HUMAN)).toBeDefined();
    });

    it("keeps a starter deleted from the Practitioners page deleted", async () => {
      expect((await adminRoutes.one.DELETE(json("DELETE"), params(AI))).status).toBe(200);
      await getPractitionerDirectory(true);
      expect(await stored(AI)).toBeUndefined();
      expect((await db.collection("practitioners").doc(AI).collection("availabilityRules").get()).size).toBe(0);
    });

    it("gives a practitioner added on the Schedule page weekday hours", async () => {
      const response = await scheduleRoutes.list.POST(json("POST", { name: "Mira Das", email: "mira@example.test", bio: "Twenty years of Parashari practice." }));
      expect(response.status).toBe(201);
      const created = await response.json();
      expect(created.rules.map((rule: { weekday: number }) => rule.weekday).sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it("refuses a duplicate email, from either page", async () => {
      const email = (await asSeen(HUMAN)).email;
      expect((await scheduleRoutes.list.POST(json("POST", { name: "Copy", email, bio: "A long enough biography." }))).status).toBe(409);
      expect((await adminRoutes.list.POST(json("POST", { name: "Copy", email }))).status).toBe(400);
    });

    it("drops photo links that are not https or on this site", async () => {
      const response = await adminRoutes.list.POST(json("POST", { name: "Link Test", email: "link@example.test", photoUrl: "javascript:alert(1)" }));
      expect(response.status).toBe(201);
      expect((await response.json()).photoUrl).toBeNull();
    });

    it("gives a human a portal invite but refuses one for an AI persona", async () => {
      expect((await inviteRoute.POST(json("POST"), params(HUMAN))).status).toBe(200);
      const refused = await inviteRoute.POST(json("POST"), params(AI));
      expect(refused.status).toBe(409);
      await expect(refused.json()).resolves.toMatchObject({ error: expect.stringContaining("AI astrologer") });
    });

    it("tells the profile page whether payout details are on file, never what they are", async () => {
      await db.collection("practitioners").doc(HUMAN).update({ bankAccountNumberEnc: "CIPHERTEXT-ACCOUNT", upiIdEnc: null });
      const profile = await getPractitionerPortalProfile(HUMAN);
      expect(profile).toMatchObject({ hasBankAccount: true, hasUpi: false, totpEnabled: false });
      expect(JSON.stringify(profile)).not.toContain("CIPHERTEXT");
    });

    it("keeps an AI persona online whatever the form says", async () => {
      const person = await asSeen(AI);
      await scheduleRoutes.one.PUT(json("PUT", { ...person, online: false }), params(AI));
      expect((await stored(AI))?.online).toBe(true);
    });
  });
});
