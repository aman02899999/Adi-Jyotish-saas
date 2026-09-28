import "server-only";

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import type { DocumentReference } from "firebase-admin/firestore";

import { db } from "@/lib/firestore";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import {
  clearTwoFactorFailuresInSupabase,
  consumeBackupCodeInSupabase,
  disableTotpInSupabase,
  enableTotpInSupabase,
  findTwoFactorIdInSupabase,
  getTotpStateInSupabase,
  getTwoFactorLockInSupabase,
  recordTwoFactorFailureInSupabase,
  setTotpPendingSecretInSupabase,
  type TwoFactorRole,
} from "@/lib/two-factor-supabase";

/** TOTP two-factor auth, shared across the member/practitioner/admin portals. The core TOTP logic
 * here is identical to what this project shipped before the Firestore migration accidentally
 * dropped it (git history: src/lib/{admin,member,practitioner}-2fa.ts, all three byte-for-byte
 * identical apart from table names) — restored as one shared module instead of three copies.
 *
 * One architectural change from the old version: login no longer verifies a password server-side
 * (the auth provider's client SDK does that before we ever see the request) and hands us an ID
 * token, not a password. So a pending 2FA challenge has to carry that already-verified ID token
 * forward to the moment the code is confirmed, since minting the final session cookie needs it.
 * The challenge token handed back to the browser is that state, sealed with AES-256-GCM (see
 * createTwoFactorChallenge). An earlier version kept challenges in an in-memory Map, but a
 * login and its verify-2fa call are separate serverless invocations: whenever they landed on
 * different instances, or a deploy happened in between, a correct code was answered with "This
 * code has expired", which locks a 2FA-protected admin out. A sealed token needs no shared
 * storage, and the ID token still never touches the database.
 *
 * Callers address an account as a {role, id} pair rather than a DocumentReference, so the same
 * routes work against either provider. Members and admins are keyed by their auth uid;
 * practitioners are keyed by slug and are resolved through firebase_uid.
 */

const CHALLENGE_MINUTES = 5;
const BACKUP_CODE_COUNT = 8;
/** Allows a code from the previous or next 30s step, absorbing normal clock drift between the
 * user's device and the server. */
const EPOCH_TOLERANCE_SECONDS = 30;

export type { TwoFactorRole };

export type TwoFactorAccount = { role: TwoFactorRole; id: string };

export type TwoFactorState = {
  totpEnabled: boolean;
  totpSecret: string | null;
  totpPendingSecret: string | null;
};

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateTotpSecret() {
  return generateSecret();
}

export async function getTotpQrDataUrl(secret: string, email: string) {
  const uri = generateURI({ issuer: "Adi Jyotish Guru", label: email, secret });
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}

export async function verifyTotpCode(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const result = await verify({ secret, token: code, epochTolerance: EPOCH_TOLERANCE_SECONDS });
    return result.valid;
  } catch {
    return false;
  }
}

function randomBackupCode() {
  return randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-");
}

export function generateBackupCodes() {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, randomBackupCode);
  return { codes, hashed: codes.map(tokenDigest) };
}

function firestoreCollectionFor(role: TwoFactorRole) {
  return role === "admin" ? "adminUsers" : role === "practitioner" ? "practitioners" : "members";
}

function firestoreRef(account: TwoFactorAccount): DocumentReference {
  return db.collection(firestoreCollectionFor(account.role)).doc(account.id);
}

/** Resolves the Firestore doc behind a uid. Practitioners are keyed by slug, so they need a
 * query; members and admins are keyed by the uid itself. */
async function firestoreRefForUid(role: TwoFactorRole, uid: string): Promise<DocumentReference | null> {
  if (role === "practitioner") {
    const snap = await db.collection("practitioners").where("firebaseUid", "==", uid).limit(1).get();
    return snap.empty ? null : snap.docs[0].ref;
  }
  return db.collection(firestoreCollectionFor(role)).doc(uid);
}

/** Resolves the account row behind an auth uid, or null when no such account exists. */
export async function resolveTwoFactorAccount(role: TwoFactorRole, uid: string): Promise<TwoFactorAccount | null> {
  if (isSupabaseCutoverActive()) {
    const id = await findTwoFactorIdInSupabase(role, uid);
    return id ? { role, id } : null;
  }
  const ref = await firestoreRefForUid(role, uid);
  return ref ? { role, id: ref.id } : null;
}

/** Reads the account's TOTP state, or null when the account row does not exist. */
export async function getTwoFactorState(account: TwoFactorAccount): Promise<TwoFactorState | null> {
  if (isSupabaseCutoverActive()) {
    return getTotpStateInSupabase(account.role, account.id);
  }
  const snap = await firestoreRef(account).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return {
    totpEnabled: data?.totpEnabled === true,
    totpSecret: (data?.totpSecret as string | undefined) ?? null,
    totpPendingSecret: (data?.totpPendingSecret as string | undefined) ?? null,
  };
}

/** Stores a not-yet-confirmed secret, so that starting a re-enrollment cannot disturb an
 * already-active factor. Only a confirm carrying a valid code for that secret promotes it. */
export async function beginTwoFactorEnrollment(account: TwoFactorAccount, secret: string): Promise<boolean> {
  if (isSupabaseCutoverActive()) return setTotpPendingSecretInSupabase(account.role, account.id, secret);
  await firestoreRef(account).update({ totpPendingSecret: secret });
  return true;
}

/** Promotes a confirmed secret to the active factor and installs its backup codes. */
export async function confirmTwoFactorEnrollment(
  account: TwoFactorAccount,
  secret: string,
  hashedBackupCodes: string[],
): Promise<boolean> {
  if (isSupabaseCutoverActive()) return enableTotpInSupabase(account.role, account.id, secret, hashedBackupCodes);
  const { FieldValue } = await import("firebase-admin/firestore");
  await firestoreRef(account).update({
    totpSecret: secret,
    totpPendingSecret: FieldValue.delete(),
    totpEnabled: true,
    totpBackupCodes: hashedBackupCodes,
  });
  return true;
}

/** Turns 2FA off and discards the secret and any unused backup codes. */
export async function disableTwoFactor(account: TwoFactorAccount): Promise<boolean> {
  if (isSupabaseCutoverActive()) return disableTotpInSupabase(account.role, account.id);
  await firestoreRef(account).update({ totpEnabled: false, totpSecret: null, totpBackupCodes: null });
  return true;
}

/** Consumes one backup code from the account, if it matches. Each code works once. */
export async function consumeBackupCode(account: TwoFactorAccount, code: string): Promise<boolean> {
  const digest = tokenDigest(code.trim().toUpperCase());
  if (isSupabaseCutoverActive()) return consumeBackupCodeInSupabase(account.role, account.id, digest);

  // In a transaction, so two requests replaying the same code cannot both read it as present:
  // the second one's read is invalidated by the first one's write and it retries against the
  // list without the code. The Supabase branch gets the same guarantee from a single UPDATE.
  const ref = firestoreRef(account);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const codes = (snap.data()?.totpBackupCodes as string[] | undefined) ?? [];
    if (!codes.includes(digest)) return false;
    tx.update(ref, { totpBackupCodes: codes.filter((existing) => existing !== digest) });
    return true;
  });
}

/** Verifies either a live TOTP code or a one-time backup code against the account. */
export async function verifyTotpOrBackupCode(account: TwoFactorAccount, secret: string, code: string): Promise<boolean> {
  const trimmed = code.trim();
  if (await verifyTotpCode(secret, trimmed)) return true;
  return trimmed.includes("-") && consumeBackupCode(account, trimmed);
}

/**
 * Per-account limit on wrong codes.
 *
 * auth-throttle.ts keys on account and client IP, in one instance's memory, so it cannot stop
 * someone who already has the password from guessing codes across many IPs. This counts wrong
 * codes per account in the database: 10 inside 15 minutes locks that account's 2FA step for 15
 * minutes, which caps guessing at about 40 codes an hour against a million possibilities. The
 * lock can only be triggered by someone who can pass the password step, and the next correct
 * code after it lifts clears the count.
 */
export const TWO_FACTOR_MAX_FAILURES = 10;
const TWO_FACTOR_FAILURE_WINDOW_SECONDS = 15 * 60;
const TWO_FACTOR_LOCK_SECONDS = 15 * 60;

function failureKey(account: TwoFactorAccount) {
  return `${account.role}:${account.id}`;
}

type FailureDoc = { failures?: number; windowStartedAt?: FirebaseFirestore.Timestamp; blockedUntil?: FirebaseFirestore.Timestamp | null };

/** Seconds until the account's 2FA step unlocks, or 0 when it is not locked. */
export async function twoFactorLockSeconds(account: TwoFactorAccount): Promise<number> {
  let blockedUntil: Date | null;
  if (isSupabaseCutoverActive()) {
    blockedUntil = await getTwoFactorLockInSupabase(failureKey(account));
  } else {
    const data = (await db.collection("twoFactorFailures").doc(failureKey(account)).get()).data() as FailureDoc | undefined;
    blockedUntil = data?.blockedUntil?.toDate() ?? null;
  }
  const remaining = blockedUntil ? blockedUntil.getTime() - Date.now() : 0;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/** Counts one wrong code; returns seconds until unlock if this failure locked the account, else 0. */
export async function recordTwoFactorFailure(account: TwoFactorAccount): Promise<number> {
  const key = failureKey(account);
  let blockedUntil: Date | null;
  if (isSupabaseCutoverActive()) {
    blockedUntil = await recordTwoFactorFailureInSupabase(key, TWO_FACTOR_MAX_FAILURES, TWO_FACTOR_FAILURE_WINDOW_SECONDS, TWO_FACTOR_LOCK_SECONDS);
  } else {
    const ref = db.collection("twoFactorFailures").doc(key);
    blockedUntil = await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() as FailureDoc | undefined;
      const now = Date.now();
      const windowStart = data?.windowStartedAt?.toDate().getTime() ?? 0;
      const fresh = now - windowStart >= TWO_FACTOR_FAILURE_WINDOW_SECONDS * 1000;
      const failures = fresh ? 1 : (data?.failures ?? 0) + 1;
      const until = failures >= TWO_FACTOR_MAX_FAILURES
        ? new Date(now + TWO_FACTOR_LOCK_SECONDS * 1000)
        : data?.blockedUntil?.toDate() ?? null;
      tx.set(ref, { failures, windowStartedAt: fresh ? new Date(now) : new Date(windowStart), blockedUntil: until });
      return until;
    });
  }
  const remaining = blockedUntil ? blockedUntil.getTime() - Date.now() : 0;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export async function clearTwoFactorFailures(account: TwoFactorAccount): Promise<void> {
  if (isSupabaseCutoverActive()) return clearTwoFactorFailuresInSupabase(failureKey(account));
  await db.collection("twoFactorFailures").doc(failureKey(account)).delete();
}

export type SignInCodeVerdict = { ok: true } | { ok: false; retryAfter: number };

/**
 * The sign-in check every verify-2fa route runs. The lock is checked before the code, so a
 * correct guess made while locked is still refused; otherwise the lock would only slow the
 * guesser down, not stop them. `retryAfter` is non-zero while the account is locked.
 */
export async function checkSignInCode(account: TwoFactorAccount, secret: string, code: string): Promise<SignInCodeVerdict> {
  const locked = await twoFactorLockSeconds(account);
  if (locked) return { ok: false, retryAfter: locked };
  if (await verifyTotpOrBackupCode(account, secret, code)) {
    await clearTwoFactorFailures(account);
    return { ok: true };
  }
  return { ok: false, retryAfter: await recordTwoFactorFailure(account) };
}

type Challenge = { r: TwoFactorRole; u: string; t: string; e: number };

const CHALLENGE_AAD = Buffer.from("two-factor-challenge-v1");
const globalForChallenge = globalThis as typeof globalThis & { __twoFactorChallengeKey?: Buffer };

/**
 * The sealing key, derived from a server secret every instance of a deployment shares.
 *
 * SUPABASE_JWT_SECRET is required once the cutover is live; FIREBASE_SERVICE_ACCOUNT_KEY is
 * what the Firestore path already cannot run without. HKDF with its own label means the derived
 * key reveals nothing about either and is useless for anything but this. With neither set (local
 * dev, tests) a per-process random key is used, which is exactly the old single-instance
 * behaviour.
 */
function challengeKey(): Buffer {
  const material = process.env.SUPABASE_JWT_SECRET?.trim() || process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (material) return Buffer.from(hkdfSync("sha256", material, "", CHALLENGE_AAD, 32));
  globalForChallenge.__twoFactorChallengeKey ??= randomBytes(32);
  return globalForChallenge.__twoFactorChallengeKey;
}

/**
 * Seals a pending 2FA challenge for an already-idToken-verified sign-in into an opaque token.
 *
 * The browser holding it already had the ID token inside, so returning it sealed exposes nothing
 * new; encryption keeps it out of logs and makes it unforgeable. It is not single-use: replaying
 * it still needs a valid TOTP or backup code (backup codes are consumed in the database), and it
 * expires with the 5-minute window.
 */
export function createTwoFactorChallenge(role: TwoFactorRole, uid: string, idToken: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", challengeKey(), iv);
  cipher.setAAD(CHALLENGE_AAD);
  const payload: Challenge = { r: role, u: uid, t: idToken, e: Date.now() + CHALLENGE_MINUTES * 60 * 1000 };
  const sealed = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), sealed].map((part) => part.toString("base64url")).join(".");
}

/** Opens a challenge token. Scoped to the expected role so a token minted for one portal's login
 * can't be replayed against another's verify-2fa endpoint. Null for anything tampered, expired,
 * sealed under another key, or malformed. */
export function peekTwoFactorChallenge(role: TwoFactorRole, token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, sealed] = parts.map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", challengeKey(), iv);
    decipher.setAAD(CHALLENGE_AAD);
    decipher.setAuthTag(tag);
    const entry = JSON.parse(Buffer.concat([decipher.update(sealed), decipher.final()]).toString("utf8")) as Challenge;
    if (entry.r !== role || typeof entry.e !== "number" || entry.e < Date.now()) return null;
    return { uid: entry.u, idToken: entry.t };
  } catch {
    return null;
  }
}

/** Called right after a login route verifies an ID token, before minting a session. Returns a
 * challenge token to hand back to the client (login should stop there) when the account has 2FA
 * enabled, or null when it's fine to proceed and create the session immediately — including the
 * common case of an account that doesn't exist yet (a brand-new member signing in for the first
 * time can't have 2FA enabled). */
export async function checkTwoFactorGate(role: TwoFactorRole, uid: string, idToken: string): Promise<string | null> {
  const account = await resolveTwoFactorAccount(role, uid);
  if (!account) return null;
  const state = await getTwoFactorState(account);
  if (!state?.totpEnabled) return null;
  return createTwoFactorChallenge(role, uid, idToken);
}
