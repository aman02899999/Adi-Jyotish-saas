import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import type { DocumentReference } from "firebase-admin/firestore";

import { db } from "@/lib/firestore";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import {
  consumeBackupCodeInSupabase,
  disableTotpInSupabase,
  enableTotpInSupabase,
  findTwoFactorIdInSupabase,
  getTotpStateInSupabase,
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
 * Rather than persist a live bearer credential to the database, challenges are held in-memory only
 * (same best-effort, single-instance-scoped pattern as rate-limit.ts and auth-throttle.ts) — the ID
 * token never touches the database, and a restart simply forces an affected in-flight login to
 * start over.
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

  // Read-modify-write, as this always was on Firestore. Two concurrent replays of the same
  // code can both read it as present; the Supabase branch closes that with a single
  // statement whose predicate is the removal itself.
  const ref = firestoreRef(account);
  const snap = await ref.get();
  const codes = (snap.data()?.totpBackupCodes as string[] | undefined) ?? [];
  if (!codes.includes(digest)) return false;
  await ref.update({ totpBackupCodes: codes.filter((existing) => existing !== digest) });
  return true;
}

/** Verifies either a live TOTP code or a one-time backup code against the account. */
export async function verifyTotpOrBackupCode(account: TwoFactorAccount, secret: string, code: string): Promise<boolean> {
  const trimmed = code.trim();
  if (await verifyTotpCode(secret, trimmed)) return true;
  return trimmed.includes("-") && consumeBackupCode(account, trimmed);
}

type Challenge = { role: TwoFactorRole; uid: string; idToken: string; expiresAt: number };
const challenges = new Map<string, Challenge>();

function sweepExpired() {
  const now = Date.now();
  for (const [key, entry] of challenges) if (entry.expiresAt < now) challenges.delete(key);
}

/** Records a pending 2FA challenge for an already-idToken-verified sign-in and returns an opaque
 * token to hand the client — never the idToken itself. */
export function createTwoFactorChallenge(role: TwoFactorRole, uid: string, idToken: string) {
  sweepExpired();
  const token = randomBytes(32).toString("base64url");
  challenges.set(tokenDigest(token), { role, uid, idToken, expiresAt: Date.now() + CHALLENGE_MINUTES * 60 * 1000 });
  return token;
}

/** Looks up the pending challenge without consuming it, so a mistyped code can be retried until
 * it expires. Scoped to the expected role so a token minted for one portal's login can't be
 * replayed against another's verify-2fa endpoint. */
export function peekTwoFactorChallenge(role: TwoFactorRole, token: string) {
  const entry = challenges.get(tokenDigest(token));
  if (!entry || entry.expiresAt < Date.now() || entry.role !== role) return null;
  return { uid: entry.uid, idToken: entry.idToken };
}

export function deleteTwoFactorChallenge(token: string) {
  challenges.delete(tokenDigest(token));
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
