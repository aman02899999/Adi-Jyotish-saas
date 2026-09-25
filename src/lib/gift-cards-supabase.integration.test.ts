import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query, withTransaction } from "@/lib/postgres";

/**
 * Gift cards on Postgres, through gift-cards.ts with the cutover on. Before this port, redeeming
 * after cutover would have credited the Firestore wallet while the member's live wallet (already
 * on Postgres) stayed unchanged: the card marked claimed, the money nowhere the member could spend
 * it. Needs a migrated database and SUPABASE_CUTOVER=true.
 */
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));

const { createGiftCard, getGiftCard, redeemGiftCard, GiftCardError } = await import("@/lib/gift-cards");

const P = "gift_itest_";
const BUYER = `${P}buyer`;
const ALICE = `${P}alice`;
const BOB = `${P}bob`;

async function cleanup() {
  await query(`delete from public.wallet_entries where wallet_id like 'gift\\_itest\\_%'`);
  await query(`delete from public.wallets where id like 'gift\\_itest\\_%'`);
  await query(`delete from public.gift_cards where buyer_id like 'gift\\_itest\\_%' or code like 'AJG-ITEST%'`);
  await query(`delete from public.gift_card_payment_index where id like 'pay\\_itest\\_%'`);
  await query(`delete from public.members where id like 'gift\\_itest\\_%'`);
}

const balance = async (memberId: string) =>
  Number((await query<{ balance: string }>(`select balance from public.wallets where id = $1`, [memberId])).rows[0]?.balance ?? 0);

const purchase = (paymentId: string, amount = 1000) =>
  createGiftCard({ buyerId: BUYER, buyerName: "Asha", amount, currency: "INR", recipientName: "Ravi", message: "Happy birthday", razorpayPaymentId: paymentId });

describeCutover("gift cards on Postgres", () => {
  beforeEach(async () => {
    await cleanup();
    for (const id of [BUYER, ALICE, BOB]) await query(`insert into public.members (id, name, email) values ($1, $1, $2)`, [id, `${id}@example.test`]);
  });
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  describe("issuing", () => {
    it("issues a card that can be read back by its code, in any case", async () => {
      const card = await purchase("pay_itest_1");
      expect(card).toMatchObject({ buyerId: BUYER, amount: 1000, status: "unclaimed", recipientName: "Ravi" });
      expect(card.code).toMatch(/^AJG-[A-Z2-9]{8}$/);
      expect(await getGiftCard(card.code.toLowerCase())).toMatchObject({ code: card.code, amount: 1000 });
    });

    it("issues one card per payment, however often the webhook is redelivered", async () => {
      const first = await purchase("pay_itest_2");
      const again = await purchase("pay_itest_2");
      const burst = await Promise.all(Array.from({ length: 5 }, () => purchase("pay_itest_2")));

      expect(new Set([first.code, again.code, ...burst.map((c) => c.code)]).size).toBe(1);
      const { rows } = await query(`select 1 from public.gift_cards where buyer_id = $1`, [BUYER]);
      expect(rows).toHaveLength(1);
    });
  });

  describe("redeeming", () => {
    it("credits the member's wallet and marks the card claimed, together", async () => {
      const card = await purchase("pay_itest_3", 2000);
      const redeemed = await redeemGiftCard({ code: card.code, memberId: ALICE });

      expect(redeemed).toMatchObject({ status: "claimed", redeemedBy: ALICE, amount: 2000 });
      expect(await balance(ALICE)).toBe(2000);
      const entry = await query(`select type, amount::int as amount from public.wallet_entries where id = $1`, [`gift_${card.code}`]);
      expect(entry.rows[0]).toEqual({ type: "gift_redeemed", amount: 2000 });
    });

    it("refuses a second redemption and credits only once", async () => {
      const card = await purchase("pay_itest_4");
      await redeemGiftCard({ code: card.code, memberId: ALICE });
      await expect(redeemGiftCard({ code: card.code, memberId: ALICE })).rejects.toThrow("already been redeemed");
      expect(await balance(ALICE)).toBe(1000);
    });

    it("lets exactly one of two members racing for the same card have it", async () => {
      const card = await purchase("pay_itest_5");
      // Make the race real: a third connection holds the card's row while both redemptions start,
      // so both are in flight at once when it lets go. Without this they rarely overlap at all.
      const hold = withTransaction(async (client) => {
        await client.query(`select 1 from public.gift_cards where code = $1 for update`, [card.code]);
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const racing = Promise.allSettled([
        redeemGiftCard({ code: card.code, memberId: ALICE }),
        redeemGiftCard({ code: card.code, memberId: BOB }),
      ]);
      await hold;
      const results = await racing;

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await balance(ALICE)) + (await balance(BOB))).toBe(1000);
      // The loser is told why. Without the row lock the ledger's primary key still stops a double
      // credit, but the loser would get a raw unique-violation error instead of this message.
      const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(lost.reason).toBeInstanceOf(GiftCardError);
      expect(lost.reason.message).toContain("already been redeemed");
    });

    it("refuses an expired card without crediting anything", async () => {
      const card = await purchase("pay_itest_6");
      await query(`update public.gift_cards set expires_at = now() - interval '1 day' where code = $1`, [card.code]);
      await expect(redeemGiftCard({ code: card.code, memberId: ALICE })).rejects.toBeInstanceOf(GiftCardError);
      expect(await balance(ALICE)).toBe(0);
    });

    it("says so for a code that does not exist", async () => {
      await expect(redeemGiftCard({ code: "AJG-ITESTNONE", memberId: ALICE })).rejects.toThrow("wasn't found");
    });
  });
});
