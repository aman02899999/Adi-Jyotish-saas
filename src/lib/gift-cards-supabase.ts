import "server-only";

import { isUniqueViolation, query, withTransaction } from "@/lib/postgres";

/**
 * Gift cards on Postgres. Same guarantees as the Firestore transactions in gift-cards.ts:
 * - one gift card per Razorpay payment, however many times the webhook is redelivered;
 * - a code collision retries with a new code instead of overwriting an issued card;
 * - redemption claims the card and credits the wallet in one transaction, so a card can never
 *   be claimed without the credit landing, or credited twice. The row lock on the card makes a
 *   losing concurrent redemption see "already redeemed"; the ledger entry's primary key
 *   (gift_<code>) is a second guard against a double credit.
 */

export type GiftCardRow = {
  code: string;
  buyerId: string;
  buyerName: string;
  amount: number;
  currency: string;
  recipientName: string;
  message: string;
  status: "unclaimed" | "claimed";
  redeemedBy: string | null;
  expiresAt: Date | null;
};

type SqlRow = {
  code: string; buyer_id: string | null; buyer_name: string; amount: string | number; currency: string;
  recipient_name: string; message: string; status: "unclaimed" | "claimed"; redeemed_by: string | null; expires_at: Date | null;
};

const COLUMNS = "code, buyer_id, buyer_name, amount, currency, recipient_name, message, status, redeemed_by, expires_at";

const fromRow = (row: SqlRow): GiftCardRow => ({
  code: row.code,
  buyerId: row.buyer_id ?? "",
  buyerName: row.buyer_name,
  amount: Number(row.amount),
  currency: row.currency,
  recipientName: row.recipient_name,
  message: row.message,
  status: row.status,
  redeemedBy: row.redeemed_by,
  expiresAt: row.expires_at ? new Date(row.expires_at) : null,
});

export class GiftCardRedeemError extends Error {}

export async function getGiftCardInSupabase(code: string): Promise<GiftCardRow | null> {
  const { rows } = await query<SqlRow>(`select ${COLUMNS} from public.gift_cards where code = $1`, [code.toUpperCase()]);
  return rows[0] ? fromRow(rows[0]) : null;
}

/**
 * Issues the gift card for a payment, or returns the one already issued for it. `nextCode` is
 * called again if a generated code is already taken.
 */
export async function createGiftCardInSupabase(
  input: Omit<GiftCardRow, "code" | "status" | "redeemedBy"> & { razorpayPaymentId: string },
  nextCode: () => string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = nextCode();
    try {
      return await withTransaction(async (client) => {
        // The index row is the per-payment lock: a redelivered webhook waits here for the first
        // transaction, then finds its row and returns the same code.
        const claimed = await client.query(
          `insert into public.gift_card_payment_index (id, razorpay_payment_id, code, recipient_name, message)
           values ($1, $1, $2, $3, $4) on conflict (id) do nothing`,
          [input.razorpayPaymentId, code, input.recipientName, input.message],
        );
        if (!claimed.rowCount) {
          const existing = await client.query<{ code: string }>(`select code from public.gift_card_payment_index where id = $1`, [input.razorpayPaymentId]);
          return existing.rows[0].code;
        }
        await client.query(
          `insert into public.gift_cards (id, code, buyer_id, buyer_name, amount, currency, recipient_name, message, status, expires_at)
           values ($1, $1, $2, $3, $4, $5, $6, $7, 'unclaimed', $8)`,
          [code, input.buyerId || null, input.buyerName, input.amount, input.currency, input.recipientName, input.message, input.expiresAt],
        );
        return code;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // The code was taken (the index insert rolled back with it): try another.
    }
  }
  throw new Error("Could not generate a unique gift card code.");
}

export async function redeemGiftCardInSupabase(code: string, memberId: string): Promise<GiftCardRow> {
  const normalized = code.toUpperCase();
  return withTransaction(async (client) => {
    const gift = await client.query<SqlRow>(`select ${COLUMNS} from public.gift_cards where code = $1 for update`, [normalized]);
    const row = gift.rows[0];
    if (!row) throw new GiftCardRedeemError("This gift code wasn't found. Double-check the code and try again.");
    if (row.status === "claimed") throw new GiftCardRedeemError("This gift has already been redeemed.");
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) throw new GiftCardRedeemError("This gift card has expired. Contact the sender for help.");

    const wallet = await client.query<{ balance: string }>(`select balance from public.wallets where id = $1 for update`, [memberId]);
    if (!wallet.rowCount) throw new Error("Wallet not found.");
    const amount = Number(row.amount);
    const balanceAfter = Number(wallet.rows[0].balance) + amount;

    await client.query(
      `insert into public.wallet_entries (id, wallet_id, type, amount, balance_after, reference_type, reference_id, razorpay_payment_id, created_at)
       values ($1, $2, 'gift_redeemed', $3, $4, 'gift_card', $5, null, now())`,
      [`gift_${normalized}`, memberId, amount, balanceAfter, normalized],
    );
    await client.query(`update public.wallets set balance = $2, updated_at = now() where id = $1`, [memberId, balanceAfter]);
    await client.query(`update public.gift_cards set status = 'claimed', redeemed_by = $2, redeemed_at = now() where code = $1`, [normalized, memberId]);
    return fromRow({ ...row, status: "claimed", redeemed_by: memberId });
  });
}
