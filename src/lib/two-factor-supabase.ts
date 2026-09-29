import "server-only";

import { query, queryModel } from "@/lib/postgres";

/**
 * Supabase data access for TOTP two-factor auth.
 *
 * `TwoFactorRole` is declared here rather than in `two-factor.ts` so that module can
 * import this one without the pair becoming circular — the twin must stay a leaf.
 *
 * The table name comes from a fixed record keyed by a union type, never from a
 * caller-supplied string, so the interpolation below is not an injection point.
 */
export type TwoFactorRole = "member" | "practitioner" | "admin";

type TwoFactorTable = "public.members" | "public.practitioners" | "public.admin_users";

const ROLE_TABLE: Record<TwoFactorRole, TwoFactorTable> = {
  member: "public.members",
  practitioner: "public.practitioners",
  admin: "public.admin_users",
};

/**
 * Resolves the account row behind a GoTrue uid.
 *
 * `members` and `admin_users` are keyed by the uid itself, which is how the Firestore
 * documents were keyed (`members.doc(uid)`, `adminUsers.doc(uid)`). `practitioners` is
 * keyed by slug and has to be looked up through `firebase_uid`, exactly as
 * `practitioners.where("firebaseUid", "==", uid)` did.
 *
 * Deliberately not filtered on `active`: the Firestore reads were plain document gets,
 * and 2FA state for a deactivated account still has to be readable so that a
 * verification attempt fails on the code rather than on a lookup that quietly moved.
 */
export async function findTwoFactorIdInSupabase(role: TwoFactorRole, uid: string): Promise<string | null> {
  const where = role === "practitioner" ? "firebase_uid = $1" : "id = $1";
  const { rows } = await query<{ id: string }>(
    `select id from ${ROLE_TABLE[role]} where ${where} limit 1`,
    [uid],
  );
  return rows[0]?.id ?? null;
}

export type TotpStateRow = {
  totpEnabled: boolean;
  totpSecret: string | null;
  totpPendingSecret: string | null;
};

/** Returns null when the row does not exist. */
export async function getTotpStateInSupabase(role: TwoFactorRole, id: string): Promise<TotpStateRow | null> {
  return queryModel<TotpStateRow>(
    `select totp_enabled, totp_secret, totp_pending_secret from ${ROLE_TABLE[role]} where id = $1`,
    [id],
  );
}

/**
 * Stores a not-yet-confirmed secret. Returns false when the row has gone away, so a
 * hijacked-session enroll against a deleted account cannot report success.
 */
export async function setTotpPendingSecretInSupabase(role: TwoFactorRole, id: string, secret: string): Promise<boolean> {
  const result = await query(
    `update ${ROLE_TABLE[role]} set totp_pending_secret = $2 where id = $1`,
    [id, secret],
  );
  return (result.rowCount ?? 0) === 1;
}

/**
 * Promotes a pending secret to the active one. `totp_pending_secret` is cleared in the
 * same statement, matching the Firestore path's `FieldValue.delete()`.
 */
export async function enableTotpInSupabase(
  role: TwoFactorRole,
  id: string,
  secret: string,
  hashedBackupCodes: string[],
): Promise<boolean> {
  const result = await query(
    `update ${ROLE_TABLE[role]}
        set totp_secret = $2,
            totp_enabled = true,
            totp_pending_secret = null,
            totp_backup_codes = $3::text[]
      where id = $1`,
    [id, secret, hashedBackupCodes],
  );
  return (result.rowCount ?? 0) === 1;
}

/**
 * Turns 2FA off and drops the secret and the remaining backup codes.
 *
 * `totp_backup_codes` becomes an empty array rather than null — the Firestore path
 * wrote null, but the column is `not null default '{}'`, and an empty array is the
 * same state as far as every reader is concerned.
 */
export async function disableTotpInSupabase(role: TwoFactorRole, id: string): Promise<boolean> {
  const result = await query(
    `update ${ROLE_TABLE[role]}
        set totp_enabled = false,
            totp_secret = null,
            totp_backup_codes = '{}'::text[]
      where id = $1`,
    [id],
  );
  return (result.rowCount ?? 0) === 1;
}

/**
 * Consumes one backup code, returning whether this call was the one that consumed it.
 *
 * The Firestore version read the list, checked it in Node, and wrote the filtered list
 * back — so two requests replaying the same code could both read it as present and both
 * succeed. The predicate and the removal are one statement here, so the row is locked
 * for the duration and the second caller matches nothing. Each code works exactly once.
 */
export async function consumeBackupCodeInSupabase(role: TwoFactorRole, id: string, digest: string): Promise<boolean> {
  const result = await query(
    `update ${ROLE_TABLE[role]}
        set totp_backup_codes = array_remove(totp_backup_codes, $2::text)
      where id = $1 and $2::text = any(totp_backup_codes)`,
    [id, digest],
  );
  return (result.rowCount ?? 0) === 1;
}

/**
 * Counts one wrong code against the account and returns the time its 2FA step is
 * locked until, or null. One statement, so concurrent wrong guesses each count: the
 * conflicting inserts serialise on the primary key and each sees the last one's count.
 * A window older than `windowSeconds` starts over at one.
 */
export async function recordTwoFactorFailureInSupabase(
  key: string,
  maxFailures: number,
  windowSeconds: number,
  lockSeconds: number,
): Promise<Date | null> {
  const fresh = `f.window_started_at <= now() - make_interval(secs => $3)`;
  const next = `(case when ${fresh} then 1 else f.failures + 1 end)`;
  const row = await queryModel<{ blockedUntil: Date | null }>(
    `insert into public.two_factor_failures as f (id, failures, window_started_at, blocked_until)
     values ($1, 1, now(), case when 1 >= $2 then now() + make_interval(secs => $4) end)
     on conflict (id) do update set
       failures = ${next},
       window_started_at = case when ${fresh} then now() else f.window_started_at end,
       blocked_until = case when ${next} >= $2 then now() + make_interval(secs => $4) else f.blocked_until end
     returning blocked_until`,
    [key, maxFailures, windowSeconds, lockSeconds],
  );
  return row?.blockedUntil ?? null;
}

/** When the account's 2FA step is locked until, or null when it is not locked now. */
export async function getTwoFactorLockInSupabase(key: string): Promise<Date | null> {
  const row = await queryModel<{ blockedUntil: Date | null }>(
    `select blocked_until from public.two_factor_failures where id = $1 and blocked_until > now()`,
    [key],
  );
  return row?.blockedUntil ?? null;
}

export async function clearTwoFactorFailuresInSupabase(key: string): Promise<void> {
  await query(`delete from public.two_factor_failures where id = $1`, [key]);
}
