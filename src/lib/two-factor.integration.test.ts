import { beforeAll, describe, expect, it } from "vitest";
import { generate } from "otplib";

import { query } from "@/lib/postgres";
import {
  beginTwoFactorEnrollment,
  checkTwoFactorGate,
  confirmTwoFactorEnrollment,
  consumeBackupCode,
  deleteTwoFactorChallenge,
  disableTwoFactor,
  generateBackupCodes,
  generateTotpSecret,
  getTwoFactorState,
  peekTwoFactorChallenge,
  resolveTwoFactorAccount,
  verifyTotpOrBackupCode,
  type TwoFactorAccount,
} from "@/lib/two-factor";

/**
 * Integration tests for the TOTP two-factor data access. Skipped unless
 * SUPABASE_DB_URL points at a reachable database.
 *
 * The 2FA routes themselves are not exercised end to end: they all call
 * cookies() through getCurrentMember / getCurrentAdmin / getCurrentPractitioner.
 * Every rule they rely on -- resolve, state, promote, consume, disable, gate -- is.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "twofa_itest_";

async function seedMember(id: string) {
  await query(
    `insert into public.members (id, name, email, created_at, updated_at)
     values ($1, $2, $3, now(), now())
     on conflict do nothing`,
    [id, `Member ${id}`, `${id}@example.test`],
  );
}

async function seedPractitioner(id: string, firebaseUid: string | null) {
  await query(
    `insert into public.practitioners (id, name, slug, email, firebase_uid, created_at, updated_at)
     values ($1, $2, $1, $3, $4, now(), now())
     on conflict do nothing`,
    [id, `Practitioner ${id}`, `${id}@example.test`, firebaseUid],
  );
}

async function seedAdmin(id: string) {
  await query(
    `insert into public.admin_users (id, name, email, created_at, updated_at)
     values ($1, $2, $3, now(), now())
     on conflict do nothing`,
    [id, `Admin ${id}`, `${id}@example.test`],
  );
}

describeDb("two-factor auth (live database)", () => {
  const member: TwoFactorAccount = { role: "member", id: `${P}member` };
  const practitioner: TwoFactorAccount = { role: "practitioner", id: `${P}prac` };
  const admin: TwoFactorAccount = { role: "admin", id: `${P}admin` };
  const racer: TwoFactorAccount = { role: "member", id: `${P}race` };
  const pracUid = `${P}prac_uid`;
  const adminUid = `${P}admin`;

  beforeAll(async () => {
    // Warm the pool before the concurrency test, or its ten calls stagger instead of racing.
    await Promise.all(Array.from({ length: 10 }, () => query(`select 1`)));
    await seedMember(member.id);
    await seedPractitioner(practitioner.id, pracUid);
    await seedAdmin(admin.id);
    await seedMember(racer.id);

    // These tests advance the same rows through the whole 2FA lifecycle, so the state
    // they assert on has to start from a known point. Seeding is idempotent; the TOTP
    // columns are not. (`_` is a LIKE wildcard, hence the escapes.)
    for (const table of ["members", "practitioners", "admin_users"]) {
      await query(
        `update public.${table}
            set totp_enabled = false, totp_secret = null, totp_pending_secret = null, totp_backup_codes = '{}'::text[]
          where id like 'twofa\\_itest\\_%'`,
      );
    }
  });

  it("reads the three TOTP columns for each role's table", async () => {
    for (const account of [member, practitioner, admin]) {
      const state = await getTwoFactorState(account);
      expect(state).not.toBeNull();
      expect(state).toMatchObject({ totpEnabled: false, totpSecret: null, totpPendingSecret: null });
    }
  });

  it("returns null for an account row that does not exist", async () => {
    expect(await getTwoFactorState({ role: "member", id: `${P}absent` })).toBeNull();
    expect(await resolveTwoFactorAccount("member", `${P}absent`)).toBeNull();
  });

  it("resolves practitioners by linked uid and members and admins by id", async () => {
    expect(await resolveTwoFactorAccount("practitioner", pracUid)).toEqual(practitioner);
    expect(await resolveTwoFactorAccount("member", member.id)).toEqual(member);
    expect(await resolveTwoFactorAccount("admin", adminUid)).toEqual(admin);
    // A practitioner row with no linked uid must not be reachable by an empty lookup.
    expect(await resolveTwoFactorAccount("practitioner", `${P}nope`)).toBeNull();
  });

  it("stores a pending secret without touching the active factor", async () => {
    const secret = generateTotpSecret();
    expect(await beginTwoFactorEnrollment(member, secret)).toBe(true);

    const state = await getTwoFactorState(member);
    expect(state?.totpPendingSecret).toBe(secret);
    // The whole point of the pending column: a hijacked session that starts a
    // re-enrollment must not be able to replace or disable the live factor.
    expect(state?.totpSecret).toBeNull();
    expect(state?.totpEnabled).toBe(false);
  });

  it("promotes the pending secret and clears it in the same write", async () => {
    const { codes, hashed } = generateBackupCodes();
    const state = await getTwoFactorState(member);
    expect(state?.totpPendingSecret).not.toBeNull();

    expect(await confirmTwoFactorEnrollment(member, state!.totpPendingSecret!, hashed)).toBe(true);

    const after = await getTwoFactorState(member);
    expect(after?.totpEnabled).toBe(true);
    expect(after?.totpSecret).toBe(state?.totpPendingSecret);
    expect(after?.totpPendingSecret).toBeNull();

    const { rows } = await query<{ codes: string[] }>(
      `select totp_backup_codes as codes from public.members where id = $1`,
      [member.id],
    );
    expect(rows[0]?.codes).toEqual(hashed);
    expect(codes).toHaveLength(8);
  });

  it("accepts a live TOTP code for the enrolled secret", async () => {
    const state = await getTwoFactorState(member);
    const code = await generate({ secret: state!.totpSecret! });
    expect(await verifyTotpOrBackupCode(member, state!.totpSecret!, code)).toBe(true);
    expect(await verifyTotpOrBackupCode(member, state!.totpSecret!, "000000")).toBe(false);
  });

  it("consumes a backup code exactly once", async () => {
    const { codes, hashed } = generateBackupCodes();
    await confirmTwoFactorEnrollment(admin, generateTotpSecret(), hashed);
    const state = await getTwoFactorState(admin);
    const secret = state!.totpSecret!;

    expect(await verifyTotpOrBackupCode(admin, secret, codes[0])).toBe(true);
    expect(await verifyTotpOrBackupCode(admin, secret, codes[0])).toBe(false);
    // A different code from the same batch still works.
    expect(await verifyTotpOrBackupCode(admin, secret, codes[1])).toBe(true);
  });

  it("normalises a lowercase, padded backup code before matching it", async () => {
    const { codes, hashed } = generateBackupCodes();
    await confirmTwoFactorEnrollment(practitioner, generateTotpSecret(), hashed);
    const state = await getTwoFactorState(practitioner);

    const padded = `  ${codes[2].toLowerCase()}  `;
    expect(padded).not.toBe(codes[2]);
    expect(await consumeBackupCode(practitioner, padded)).toBe(true);
    expect(await consumeBackupCode(practitioner, codes[2])).toBe(false);
  });

  it("gives two concurrent uses of one backup code exactly one winner", async () => {
    // The Firestore read-modify-write let both of these succeed.
    const { codes, hashed } = generateBackupCodes();
    await confirmTwoFactorEnrollment(racer, generateTotpSecret(), hashed);

    const results = await Promise.all([
      consumeBackupCode(racer, codes[0]),
      consumeBackupCode(racer, codes[0]),
      consumeBackupCode(racer, codes[0]),
      consumeBackupCode(racer, codes[0]),
      consumeBackupCode(racer, codes[0]),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);

    const { rows } = await query<{ remaining: string[] }>(
      `select totp_backup_codes as remaining from public.members where id = $1`,
      [racer.id],
    );
    expect(rows[0]?.remaining).toHaveLength(hashed.length - 1);
  });

  it("rejects a code that was never issued", async () => {
    expect(await consumeBackupCode(admin, "ZZZZZ-ZZZZZ")).toBe(false);
  });

  it("turns 2FA off and discards the secret and remaining codes", async () => {
    expect(await disableTwoFactor(practitioner)).toBe(true);

    const state = await getTwoFactorState(practitioner);
    expect(state).toMatchObject({ totpEnabled: false, totpSecret: null });

    const { rows } = await query<{ remaining: string[] }>(
      `select totp_backup_codes as remaining from public.practitioners where id = $1`,
      [practitioner.id],
    );
    expect(rows[0]?.remaining).toEqual([]);
  });

  it("resolves a deactivated practitioner, so verification fails on the code not the lookup", async () => {
    const off: TwoFactorAccount = { role: "practitioner", id: `${P}off` };
    const offUid = `${P}off_uid`;
    await seedPractitioner(off.id, offUid);
    await query(`update public.practitioners set active = false where id = $1`, [off.id]);

    // The Firestore reads were plain document gets with no active filter; a lookup
    // that silently narrowed here would change which error a user sees.
    expect(await resolveTwoFactorAccount("practitioner", offUid)).toEqual(off);
    expect(await getTwoFactorState(off)).not.toBeNull();
  });

  it("gates sign-in only for an account that has 2FA on", async () => {
    // member has 2FA enabled from the tests above; practitioner was just disabled.
    const token = await checkTwoFactorGate("member", member.id, "fake-id-token");
    expect(token).toBeTruthy();
    expect(await checkTwoFactorGate("practitioner", pracUid, "fake-id-token")).toBeNull();
    // A brand-new member signing in for the first time has no row at all.
    expect(await checkTwoFactorGate("member", `${P}ghost`, "fake-id-token")).toBeNull();

    // The challenge is scoped to the portal that minted it.
    expect(peekTwoFactorChallenge("member", token!)).toMatchObject({ uid: member.id, idToken: "fake-id-token" });
    expect(peekTwoFactorChallenge("admin", token!)).toBeNull();
    deleteTwoFactorChallenge(token!);
    expect(peekTwoFactorChallenge("member", token!)).toBeNull();
  });

  it("mints a distinct challenge token per call", async () => {
    const a = await checkTwoFactorGate("member", member.id, "t1");
    const b = await checkTwoFactorGate("member", member.id, "t2");
    expect(a).not.toBe(b);
    expect(peekTwoFactorChallenge("member", a!)?.idToken).toBe("t1");
    expect(peekTwoFactorChallenge("member", b!)?.idToken).toBe("t2");
    deleteTwoFactorChallenge(a!);
    deleteTwoFactorChallenge(b!);
  });
});
