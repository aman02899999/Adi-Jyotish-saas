import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Moving a booking to another astrologer, on the live Firestore path. Bookings sold with an AI
 * persona before those stopped being bookable have nobody to attend them; reassigning to a human
 * keeps the member's payment and invoice. Runs against the Firestore emulator; see
 * synthetic-reviews.firestore.test.ts for how.
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
vi.mock("@/lib/admin-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-auth")>()),
  getCurrentAdmin: async () => ({ id: "admin-itest", name: "Admin", email: "admin@example.test", role: "owner", permissions: ["bookings"] }),
  hasAdminPermission: () => true,
  recordAudit: async () => {},
}));
const sent = vi.hoisted(() => ({ member: [] as string[], practitioner: [] as string[] }));
vi.mock("@/lib/messaging", () => ({ sendBookingNotification: async ({ body }: { body: string }) => { sent.member.push(body); } }));
vi.mock("@/lib/notifications", () => ({ createNotification: async ({ recipientId }: { recipientId: string }) => { sent.practitioner.push(recipientId); } }));

const { db } = await import("@/lib/firestore");
const { getPractitionerDirectory } = await import("@/lib/scheduling");
const { PUT } = await import("@/app/api/bookings/[id]/route");

const AI = "anika-sharma";
const OTHER_AI = "rohan-mehta";
const HUMAN = "jagmohan-shashtri-ji";
const OTHER_HUMAN = "arun-dubey-ji";

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

/** 11:30 IST on a Tuesday-to-Friday comfortably ahead, inside every seeded rule set. */
function upcomingSlot(): Date {
  const date = new Date(Date.now() + 3 * 86_400_000);
  while (![2, 3, 4, 5].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return new Date(`${date.toISOString().slice(0, 10)}T06:00:00.000Z`);
}

async function addBooking(id: string, practitionerId: string, practitionerName: string, scheduledAt: Date) {
  await db.collection("bookings").doc(id).set({
    reference: `JY-${id}`,
    serviceId: "svc",
    serviceTitle: "Birth chart reading",
    servicePrice: 1500,
    serviceDuration: 60,
    practitionerId,
    practitionerName,
    clientName: "Asha Test",
    clientEmail: "asha@example.test",
    clientPhone: null,
    birthDate: "1990-01-01",
    birthTime: "10:00",
    birthPlace: "Delhi",
    scheduledAt,
    notes: null,
    status: "confirmed",
    paymentStatus: "paid",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

const reassign = (bookingId: string, practitionerId: string) => PUT(new Request(`https://example.test/api/bookings/${bookingId}`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ practitionerId }),
}), { params: Promise.resolve({ id: bookingId }) });

const stored = async (id: string) => (await db.collection("bookings").doc(id).get()).data() as Record<string, unknown>;

describeFirestore("reassigning a booking on the live Firestore path", () => {
  beforeEach(async () => {
    await clearEmulator();
    await getPractitionerDirectory(true);
    sent.member.length = 0;
    sent.practitioner.length = 0;
    await addBooking("sold-with-ai", AI, "Anika Sharma", upcomingSlot());
  });
  afterAll(clearEmulator);

  it("moves a booking from an AI persona to a human astrologer", async () => {
    const response = await reassign("sold-with-ai", HUMAN);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ practitionerId: HUMAN, practitionerName: "Shree Jagmohan Shashtri Ji" });

    expect(await stored("sold-with-ai")).toMatchObject({ practitionerId: HUMAN, practitionerName: "Shree Jagmohan Shashtri Ji", paymentStatus: "paid", status: "confirmed" });
  });

  it("tells the member and the new astrologer", async () => {
    await reassign("sold-with-ai", HUMAN);
    expect(sent.member.join(" ")).toContain("Your astrologer is now Shree Jagmohan Shashtri Ji.");
    expect(sent.practitioner).toEqual([HUMAN]);
  });

  it("refuses to move a booking to another AI persona", async () => {
    const response = await reassign("sold-with-ai", OTHER_AI);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("AI astrologer") });
    expect((await stored("sold-with-ai")).practitionerId).toBe(AI);
  });

  it("refuses an astrologer who is already booked at that time", async () => {
    await addBooking("already-there", HUMAN, "Shree Jagmohan Shashtri Ji", upcomingSlot());
    const response = await reassign("sold-with-ai", HUMAN);

    expect(response.status).toBe(409);
    expect((await stored("sold-with-ai")).practitionerId).toBe(AI);
  });

  it("refuses an inactive astrologer", async () => {
    await db.collection("practitioners").doc(OTHER_HUMAN).update({ active: false });
    const response = await reassign("sold-with-ai", OTHER_HUMAN);

    expect(response.status).toBe(409);
    expect((await stored("sold-with-ai")).practitionerId).toBe(AI);
  });

  it("refuses an astrologer who does not exist", async () => {
    expect((await reassign("sold-with-ai", "nobody")).status).toBe(409);
  });
});
