import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * seedPractitioners() on the live Firestore path. It runs on every directory read, and until this
 * change it rewrote the admin's edits to all 34 starter practitioners each time — inside the admin
 * update route too, so the save response came back with the edit already undone. These drive the
 * real admin routes against the Firestore emulator; see synthetic-reviews.firestore.test.ts for
 * how to run them.
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
vi.mock("@/lib/admin-auth", () => ({
  getCurrentAdmin: async () => ({ id: "admin-itest", name: "Admin", email: "admin@example.test", role: "owner", permissions: ["schedule"] }),
  hasAdminPermission: () => true,
  recordAudit: async () => {},
}));

const { db } = await import("@/lib/firestore");
const { getPractitionerDirectory, seedPractitioners } = await import("@/lib/scheduling");
const practitionerRoute = await import("@/app/api/practitioners/[id]/route");
const scheduleRoute = await import("@/app/api/practitioners/[id]/schedule/route");

const HUMAN = "jagmohan-shashtri-ji";
const AI = "anika-sharma";
const ROSTER_SIZE = 34;

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const doc = (id: string) => db.collection("practitioners").doc(id);
const data = async (id: string) => (await doc(id).get()).data() as Record<string, unknown>;

async function adminSave(id: string, changes: Record<string, unknown>) {
  const current = await data(id);
  const body = { ...current, ...changes };
  return practitionerRoute.PUT(new Request(`https://example.test/api/practitioners/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), params(id));
}

describeFirestore("seedPractitioners on the live Firestore path", () => {
  beforeEach(async () => {
    await clearEmulator();
    await seedPractitioners();
  });
  afterAll(clearEmulator);

  describe("first run", () => {
    it("creates the whole roster with starter hours", async () => {
      const practitioners = await db.collection("practitioners").get();
      expect(practitioners.size).toBe(ROSTER_SIZE);
      expect((await doc(HUMAN).collection("availabilityRules").get()).size).toBe(5);
      expect((await doc(AI).collection("availabilityRules").get()).size).toBe(5);
    });

    it("survives two first reads racing each other", async () => {
      await clearEmulator();
      await Promise.all([seedPractitioners(), seedPractitioners(), seedPractitioners()]);
      expect((await db.collection("practitioners").get()).size).toBe(ROSTER_SIZE);
      expect((await doc(AI).collection("availabilityRules").get()).size).toBe(5);
    });
  });

  describe("admin edits", () => {
    it("returns the edit from the save itself instead of the starter copy", async () => {
      const response = await adminSave(HUMAN, { title: "Jyotish Acharya", bio: "A biography the studio wrote itself.", chatRatePerMinute: 150 });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ title: "Jyotish Acharya", bio: "A biography the studio wrote itself.", chatRatePerMinute: 150 });
    });

    it("keeps every edited field across later directory reads", async () => {
      await adminSave(AI, {
        title: "Birth chart guide",
        bio: "Edited by the studio after launch.",
        specialties: "Birth charts",
        languages: "English",
        consultationModes: "Chat",
        experienceYears: 0,
        verified: false,
        verificationLevel: "reviewed",
        chatRatePerMinute: 30,
        featured: true,
      });
      await getPractitionerDirectory();
      await getPractitionerDirectory(true);

      expect(await data(AI)).toMatchObject({
        title: "Birth chart guide",
        bio: "Edited by the studio after launch.",
        specialties: "Birth charts",
        languages: "English",
        consultationModes: "Chat",
        experienceYears: 0,
        verified: false,
        verificationLevel: "reviewed",
        chatRatePerMinute: 30,
        featured: true,
      });
    });

    it("keeps a human astrologer offline once they switch off", async () => {
      await adminSave(HUMAN, { online: false });
      await getPractitionerDirectory();
      expect((await data(HUMAN)).online).toBe(false);
    });

    it("still keeps AI personas online, since nobody can switch them on", async () => {
      await doc(AI).update({ online: false });
      await getPractitionerDirectory();
      expect((await data(AI)).online).toBe(true);
    });

    it("keeps isAiPowered true to the roster", async () => {
      await doc(AI).update({ isAiPowered: false });
      await doc(HUMAN).update({ isAiPowered: true });
      await getPractitionerDirectory();
      expect((await data(AI)).isAiPowered).toBe(true);
      expect((await data(HUMAN)).isAiPowered).toBe(false);
    });
  });

  describe("deleting and clearing", () => {
    it("keeps a deleted starter deleted", async () => {
      const response = await practitionerRoute.DELETE(new Request(`https://example.test/api/practitioners/${AI}`, { method: "DELETE" }), params(AI));
      expect(response.status).toBe(200);
      const directory = await getPractitionerDirectory();

      expect(directory.find((person) => person.id === AI)).toBeUndefined();
      expect((await doc(AI).get()).exists).toBe(false);
    });

    it("removes the deleted practitioner's hours with it", async () => {
      await practitionerRoute.DELETE(new Request(`https://example.test/api/practitioners/${AI}`, { method: "DELETE" }), params(AI));
      expect((await doc(AI).collection("availabilityRules").get()).size).toBe(0);
    });

    it("leaves a cleared schedule empty", async () => {
      const response = await scheduleRoute.PUT(new Request(`https://example.test/api/practitioners/${HUMAN}/schedule`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules: [], timeOff: [] }),
      }), params(HUMAN));
      expect(response.status).toBe(200);
      await getPractitionerDirectory();

      expect((await doc(HUMAN).collection("availabilityRules").get()).size).toBe(0);
    });
  });

  describe("corrected starter copy", () => {
    const OLD_BIO = "Ravi Shankar ji has nearly two decades of experience helping students with concentration remedies and guidance on career direction after their studies.";

    it("replaces the old copy where nobody has edited it", async () => {
      await doc("ravi-shankar-pillai").update({ bio: OLD_BIO });
      await doc(AI).update({ title: "Senior Vedic Astrologer" });
      await getPractitionerDirectory();

      expect((await data("ravi-shankar-pillai")).bio).not.toMatch(/decades|experience/);
      expect((await data(AI)).title).toBe("Vedic Astrologer");
    });

    it("leaves copy an admin has edited alone", async () => {
      const edited = `${OLD_BIO} Edited.`;
      await doc("ravi-shankar-pillai").update({ bio: edited });
      await getPractitionerDirectory();
      expect((await data("ravi-shankar-pillai")).bio).toBe(edited);
    });

    it("fills a missing photo but never replaces one", async () => {
      await doc(HUMAN).update({ photoUrl: null });
      await doc("arun-dubey-ji").update({ photoUrl: "/uploads/real-photo.jpg" });
      await getPractitionerDirectory();

      expect((await data(HUMAN)).photoUrl).toBe("/images/practitioners/jagmohan-shashtri.jpg");
      expect((await data("arun-dubey-ji")).photoUrl).toBe("/uploads/real-photo.jpg");
    });
  });

  it("writes nothing when nothing has drifted", async () => {
    // updateTime cannot show this: Firestore leaves it alone for a write that changes no values,
    // but still bills the write. This runs on every directory read, so count the calls.
    const { DocumentReference, WriteBatch } = await import("firebase-admin/firestore");
    const update = vi.spyOn(DocumentReference.prototype, "update");
    const commit = vi.spyOn(WriteBatch.prototype, "commit");
    try {
      await seedPractitioners();
      expect(update).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    } finally {
      update.mockRestore();
      commit.mockRestore();
    }
  });
});
