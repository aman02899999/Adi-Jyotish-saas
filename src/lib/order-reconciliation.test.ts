import { beforeEach, describe, expect, it, vi } from "vitest";

/** Which record a captured payment settles, on the Firestore path the live site runs. */
const h = vi.hoisted(() => ({
  reading: null as null | { id: string; razorpayOrderId: string | null; status: string },
  order: null as null | { id: string; razorpayOrderId: string | null },
  readingsPaid: [] as string[],
  ordersPaid: [] as string[],
  gifts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase-config", () => ({ isSupabaseCutoverActive: () => false }));
vi.mock("@/lib/razorpay-webhook-supabase", () => ({ getMemberContactInSupabase: async () => null }));
vi.mock("@/lib/firestore", () => ({
  db: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ name: "Asha" }) }) }) }) },
}));
vi.mock("@/lib/ai-readings", () => ({
  getReadingById: async (id: string, memberId: string) => (h.reading && h.reading.id === id && memberId === "m1" ? h.reading : null),
  markReadingPaid: async ({ readingId }: { readingId: string }) => { h.readingsPaid.push(readingId); },
}));
vi.mock("@/lib/gemstone-orders", () => ({
  getOrderById: async (id: string) => (h.order && h.order.id === id ? h.order : null),
  markOrderPaid: async ({ orderId }: { orderId: string }) => { h.ordersPaid.push(orderId); },
}));
vi.mock("@/lib/gift-cards", () => ({ createGiftCard: async (input: Record<string, unknown>) => { h.gifts.push(input); } }));

import { settleUnconfirmedCapture } from "@/lib/order-reconciliation";

beforeEach(() => {
  h.reading = { id: "r1", razorpayOrderId: "order_1", status: "pending_payment" };
  h.order = { id: "g1", razorpayOrderId: "order_g1" };
  h.readingsPaid = [];
  h.ordersPaid = [];
  h.gifts = [];
});

describe("settleUnconfirmedCapture", () => {
  it("marks an unpaid reading paid when the order matches", async () => {
    expect(await settleUnconfirmedCapture({ id: "pay_1", order_id: "order_1", notes: { memberId: "m1", readingId: "r1" } })).toBe("reading");
    expect(h.readingsPaid).toEqual(["r1"]);
  });

  it("leaves a reading the browser already confirmed as it is", async () => {
    h.reading!.status = "answered";
    expect(await settleUnconfirmedCapture({ id: "pay_1", order_id: "order_1", notes: { memberId: "m1", readingId: "r1" } })).toBe("reading");
    expect(h.readingsPaid).toEqual([]);
  });

  it("refuses a reading whose order does not match the payment", async () => {
    expect(await settleUnconfirmedCapture({ id: "pay_1", order_id: "order_other", notes: { memberId: "m1", readingId: "r1" } })).toBeNull();
    expect(h.readingsPaid).toEqual([]);
  });

  it("marks a gemstone order paid only when the order matches", async () => {
    expect(await settleUnconfirmedCapture({ id: "pay_g", order_id: "order_other", notes: { gemstoneOrderId: "g1" } })).toBeNull();
    expect(await settleUnconfirmedCapture({ id: "pay_g", order_id: "order_g1", notes: { gemstoneOrderId: "g1" } })).toBe("gemstone_order");
    expect(h.ordersPaid).toEqual(["g1"]);
  });

  it("issues a gift card for the amount paid, in rupees, under the buyer's name", async () => {
    await settleUnconfirmedCapture({ id: "pay_gift", order_id: "order_gift", amount: 50000, currency: "INR", notes: { memberId: "m1", purpose: "gift_card", recipientName: "Meera", message: "Hi" } });
    expect(h.gifts).toEqual([{ buyerId: "m1", buyerName: "Asha", amount: 500, currency: "INR", recipientName: "Meera", message: "Hi", razorpayPaymentId: "pay_gift" }]);
  });

  it("ignores a payment with no order id", async () => {
    expect(await settleUnconfirmedCapture({ id: "pay_1", notes: { memberId: "m1", readingId: "r1" } })).toBeNull();
  });
});
