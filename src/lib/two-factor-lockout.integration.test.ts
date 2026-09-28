import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generate } from "otplib";

import { query } from "@/lib/postgres";
import {
  checkSignInCode,
  generateTotpSecret,
  recordTwoFactorFailure,
  TWO_FACTOR_MAX_FAILURES,
  twoFactorLockSeconds,
  type TwoFactorAccount,
} from "@/lib/two-factor";

/**
 * The per-account limit on wrong 2FA codes, on the Postgres path. Skipped unless SUPABASE_DB_URL
 * points at a reachable database. The failure rows are keyed by role and id and never touch an
 * account row, so no account needs seeding.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const account: TwoFactorAccount = { role: "admin", id: "twofa_lock_itest_admin" };
const other: TwoFactorAccount = { role: "member", id: "twofa_lock_itest_admin" };
const secret = generateTotpSecret();
const wrong = async () => {
  const right = await generate({ secret });
  return right === "000000" ? "111111" : "000000";
};

const cleanup = () => query(`delete from public.two_factor_failures where id like '%twofa\\_lock\\_itest\\_%'`);

describeDb("2FA wrong-code lockout (live database)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("locks the account on the tenth wrong code, and then refuses even the right one", async () => {
    for (let i = 1; i < TWO_FACTOR_MAX_FAILURES; i += 1) {
      expect(await checkSignInCode(account, secret, await wrong())).toEqual({ ok: false, retryAfter: 0 });
    }
    const tenth = await checkSignInCode(account, secret, await wrong());
    expect(tenth.ok).toBe(false);
    expect(!tenth.ok && tenth.retryAfter).toBeGreaterThan(14 * 60);

    expect((await checkSignInCode(account, secret, await generate({ secret }))).ok).toBe(false);
    expect(await twoFactorLockSeconds(account)).toBeGreaterThan(0);
    // Scoped to the account: the same id under another portal is unaffected.
    expect(await twoFactorLockSeconds(other)).toBe(0);
  });

  it("counts every one of many simultaneous wrong codes", async () => {
    await Promise.all(Array.from({ length: TWO_FACTOR_MAX_FAILURES }, () => recordTwoFactorFailure(account)));
    const row = await query<{ failures: number }>(`select failures from public.two_factor_failures where id = $1`, [`admin:${account.id}`]);
    expect(row.rows[0].failures).toBe(TWO_FACTOR_MAX_FAILURES);
    expect(await twoFactorLockSeconds(account)).toBeGreaterThan(0);
  });

  it("clears the count on a correct code, and starts over once the window has passed", async () => {
    for (let i = 1; i < TWO_FACTOR_MAX_FAILURES; i += 1) await recordTwoFactorFailure(account);
    expect(await checkSignInCode(account, secret, await generate({ secret }))).toEqual({ ok: true });
    expect(await recordTwoFactorFailure(account)).toBe(0);
    expect(await twoFactorLockSeconds(account)).toBe(0);

    await cleanup();
    for (let i = 1; i < TWO_FACTOR_MAX_FAILURES; i += 1) await recordTwoFactorFailure(account);
    await query(`update public.two_factor_failures set window_started_at = now() - interval '16 minutes' where id = $1`, [`admin:${account.id}`]);
    expect(await recordTwoFactorFailure(account)).toBe(0);
    expect(await twoFactorLockSeconds(account)).toBe(0);
    // The new window has to start now, or every later failure would also look stale and the
    // count would never climb past one again.
    for (let i = 2; i < TWO_FACTOR_MAX_FAILURES; i += 1) expect(await recordTwoFactorFailure(account)).toBe(0);
    expect(await recordTwoFactorFailure(account)).toBeGreaterThan(0);
  });
});
