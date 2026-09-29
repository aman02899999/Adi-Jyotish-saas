import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// unstable_cache needs Next's incremental cache; wallet.ts reads the studio currency off this.
vi.mock("@/lib/studio-settings", () => ({
  getStudioSettings: async () => ({ currency: "INR", gstRate: 18 }),
}));

import { closePgPool, query } from "@/lib/postgres";
import { AdminCreditError, creditWalletByAdmin } from "@/lib/wallet-admin";

/** An admin's manual wallet credit on Postgres: applied once per request, never for a ghost. */
const describeDb = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;
const MEMBER = "itest-admin-credit-member";

async function cleanup() {
  await query(`delete from public.wallet_entries where wallet_id like 'itest-admin-credit%'`);
  await query(`delete from public.wallets where id like 'itest-admin-credit%'`);
  await query(`delete from public.members where id like 'itest-admin-credit%'`);
}

describeDb("admin wallet credit on Postgres", () => {
  beforeAll(async () => {
    await cleanup();
    await query(`insert into public.members (id, name, email) values ($1, $2, $3)`, [MEMBER, "Credit Member", "credit-itest@example.com"]);
  });
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("credits once, even when the same request arrives twice at the same time", async () => {
    const input = { memberId: MEMBER, amount: 199, reason: "Refund", requestId: "req-itest-0001" };
    await Promise.all([creditWalletByAdmin(input), creditWalletByAdmin(input)]);
    await creditWalletByAdmin(input);

    const wallet = await query(`select balance from public.wallets where id = $1`, [MEMBER]);
    expect(Number(wallet.rows[0].balance)).toBe(199);
    const entries = await query(`select type, amount from public.wallet_entries where wallet_id = $1`, [MEMBER]);
    expect(entries.rows.map((row) => ({ type: row.type, amount: Number(row.amount) }))).toEqual([{ type: "admin_credit", amount: 199 }]);
  });

  it("adds a second credit that has its own request id", async () => {
    await creditWalletByAdmin({ memberId: MEMBER, amount: 50, reason: "Goodwill", requestId: "req-itest-0002" });
    const wallet = await query(`select balance from public.wallets where id = $1`, [MEMBER]);
    expect(Number(wallet.rows[0].balance)).toBe(249);
  });

  it("refuses an unknown member and opens no wallet for it", async () => {
    await expect(creditWalletByAdmin({ memberId: "itest-admin-credit-ghost", amount: 10, reason: "x", requestId: "req-itest-0003" })).rejects.toBeInstanceOf(AdminCreditError);
    const wallet = await query(`select 1 from public.wallets where id = $1`, ["itest-admin-credit-ghost"]);
    expect(wallet.rowCount).toBe(0);
  });
});
