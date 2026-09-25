import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gemstone reviews and wishlist on the live Firestore path. createReview and
 * notifyWishlistedMembers were restructured to share code with the Postgres path. Runs against
 * the Firestore emulator; see synthetic-reviews.firestore.test.ts.
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-jyotish";
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "true" && !EMULATOR) {
  throw new Error("REQUIRE_FIRESTORE_EMULATOR is set but FIRESTORE_EMULATOR_HOST is not — the emulator did not start.");
}
const describeFirestore = EMULATOR ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
const sent = vi.hoisted(() => ({ notifications: [] as string[], emails: [] as string[] }));
vi.mock("@/lib/notifications", () => ({
  createNotification: async ({ recipientId }: { recipientId: string }) => { sent.notifications.push(recipientId); },
  notifyAdmins: async () => {},
}));
vi.mock("@/lib/email", () => ({
  sendEmail: async ({ to }: { to: string }) => { sent.emails.push(to); },
  genericNotificationEmailHtml: () => "<p></p>",
}));
vi.mock("@/lib/admin-roles", () => ({ getAdminIdsWithPermission: async () => [] }));

const { db } = await import("@/lib/firestore");
const reviews = await import("@/lib/gemstone-reviews");
const wishlist = await import("@/lib/gemstone-wishlist");

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

describeFirestore("the gemstone store on the live Firestore path", () => {
  beforeEach(async () => {
    await clearEmulator();
    sent.notifications.length = 0;
    sent.emails.length = 0;
    await db.collection("gemstoneOrders").doc("paid").set({ memberId: "m1", paymentStatus: "paid" });
    await db.collection("gemstoneOrders").doc("paid").collection("items").add({ productId: "p1" });
    for (const id of ["m1", "m2"]) await db.collection("members").doc(id).set({ name: "Asha", email: `${id}@example.test` });
  });
  afterAll(clearEmulator);

  it("verifies a purchase once, moderates, and counts helpful votes", async () => {
    const verified = await reviews.createReview({ productId: "p1", memberId: "m1", orderId: "paid", reviewerName: "Asha", rating: 5, body: "Beautiful stone, as described." });
    expect(verified).toMatchObject({ id: "paid_p1", orderId: "paid", status: "pending" });
    await expect(reviews.createReview({ productId: "p1", memberId: "m1", orderId: "paid", reviewerName: "Asha", rating: 5, body: "Beautiful stone, as described." })).rejects.toThrow("already reviewed");
    expect((await reviews.createReview({ productId: "p1", memberId: "m2", orderId: "paid", reviewerName: "Ravi", rating: 4, body: "Nice, arrived quickly." })).orderId).toBeNull();

    await reviews.moderateReview(verified.id, "published");
    expect((await reviews.getPublishedReviews("p1")).map((r) => r.id)).toEqual(["paid_p1"]);
    expect((await reviews.markReviewHelpful(verified.id)).helpfulVotes).toBe(1);
  });

  it("tells everyone who saved a product when it is back in stock", async () => {
    expect(await wishlist.toggleWishlist("m1", "p1")).toEqual({ added: true });
    await wishlist.toggleWishlist("m2", "p1");
    expect(await wishlist.notifyWishlistedMembers("p1", "Sapphire", "sapphire", { priceDropped: false, backInStock: true })).toEqual({ notified: 2 });
    expect(sent.emails.sort()).toEqual(["m1@example.test", "m2@example.test"]);
    expect(await wishlist.toggleWishlist("m1", "p1")).toEqual({ added: false });
  });
});
