import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// unstable_cache needs Next's incremental cache; wallet and gift code read the studio currency.
vi.mock("@/lib/studio-settings", () => ({ getStudioSettings: async () => ({ currency: "INR", gstRate: 18 }) }));

import { closePgPool, query } from "@/lib/postgres";
import { attachRazorpayOrder, createPendingReading } from "@/lib/ai-readings";
import { settleUnconfirmedCapture } from "@/lib/order-reconciliation";

/**
 * A member who pays and closes the tab before the browser confirms: the webhook must settle the
 * record the payment was for, once, and only when the payment's order matches the record's.
 */
const describeDb = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;
const MEMBER = "recon_itest_member";
const BIRTH = { clientName: "Recon Member", birthDate: "1990-01-01", birthTime: "06:00", birthPlace: "Delhi, India" };

async function cleanup() {
  await query(`delete from public.ai_readings where member_id = $1`, [MEMBER]);
  await query(`delete from public.gift_cards where buyer_id = $1`, [MEMBER]);
  await query(`delete from public.gift_card_payment_index where id like 'pay\\_recon\\_%'`);
  await query(`delete from public.members where id = $1`, [MEMBER]);
}

describeDb("settling a captured payment the browser never confirmed", () => {
  beforeAll(async () => {
    await cleanup();
    await query(`insert into public.members (id, name, email) values ($1, $2, $3)`, [MEMBER, "Recon Member", "recon-itest@example.com"]);
  });
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  const status = async (id: string) => (await query(`select status, razorpay_payment_id from public.ai_readings where id = $1`, [id])).rows[0];

  it("marks the reading paid, and a second delivery changes nothing", async () => {
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "Will I move abroad?" });
    await attachRazorpayOrder(reading.id, "order_recon_1");
    const payment = { id: "pay_recon_1", order_id: "order_recon_1", amount: reading.price * 100, notes: { memberId: MEMBER, readingId: reading.id } };

    expect(await settleUnconfirmedCapture(payment)).toBe("reading");
    expect(await status(reading.id)).toEqual({ status: "paid", razorpay_payment_id: "pay_recon_1" });
    expect(await settleUnconfirmedCapture(payment)).toBe("reading");
    expect(await status(reading.id)).toEqual({ status: "paid", razorpay_payment_id: "pay_recon_1" });
  });

  it("refuses a payment whose order is not the reading's", async () => {
    // Notes are set when the order is created, but the order id is what Razorpay actually charged.
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "Career this year?" });
    await attachRazorpayOrder(reading.id, "order_recon_2");
    const payment = { id: "pay_recon_2", order_id: "order_recon_other", notes: { memberId: MEMBER, readingId: reading.id } };

    expect(await settleUnconfirmedCapture(payment)).toBeNull();
    expect((await status(reading.id)).status).toBe("pending_payment");
  });

  it("refuses a reading that belongs to another member", async () => {
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "Marriage timing?" });
    await attachRazorpayOrder(reading.id, "order_recon_3");
    const payment = { id: "pay_recon_3", order_id: "order_recon_3", notes: { memberId: "someone-else", readingId: reading.id } };

    expect(await settleUnconfirmedCapture(payment)).toBeNull();
    expect((await status(reading.id)).status).toBe("pending_payment");
  });

  it("issues the gift card once, with the buyer's name and the amount paid", async () => {
    const payment = { id: "pay_recon_gift", order_id: "order_recon_gift", amount: 100000, currency: "INR", notes: { memberId: MEMBER, purpose: "gift_card", recipientName: "Meera", message: "Happy birthday" } };

    expect(await settleUnconfirmedCapture(payment)).toBe("gift_card");
    expect(await settleUnconfirmedCapture(payment)).toBe("gift_card");

    const { rows } = await query(`select buyer_name, amount, recipient_name from public.gift_cards where buyer_id = $1`, [MEMBER]);
    expect(rows.map((row) => ({ buyer: row.buyer_name, amount: Number(row.amount), recipient: row.recipient_name }))).toEqual([
      { buyer: "Recon Member", amount: 1000, recipient: "Meera" },
    ]);
  });

  it("leaves other payments alone", async () => {
    expect(await settleUnconfirmedCapture({ id: "pay_recon_x", order_id: "order_recon_x", notes: { memberId: MEMBER } })).toBeNull();
  });
});
