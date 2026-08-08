import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import type { DocumentReference } from "firebase-admin/firestore";

/** TOTP two-factor auth, shared across the member/practitioner/admin portals. The core TOTP logic
 * here is identical to what this project shipped before the Firestore migration accidentally
 * dropped it (git history: src/lib/{admin,member,practitioner}-2fa.ts, all three byte-for-byte
 * identical apart from table names) — restored as one shared module instead of three copies.
 *
 * One architectural change from the old version: login no longer verifies a password server-side
 * (Firebase Auth's client SDK does that before we ever see the request) and hands us an ID token,
 * not a password. So a pending 2FA challenge has to carry that already-verified ID token forward
 * to the moment the code is confirmed, since minting the final session cookie needs it. Rather
 * than persist a live bearer credential to Firestore, challenges are held in-memory only (same
 * best-effort, single-instance-scoped pattern as rate-limit.ts and auth-throttle.ts) — the ID
 * token never touches the database, and a restart simply forces an affected in-flight login to
 * start over.
 */

const CHALLENGE_MINUTES = 5;
const BACKUP_CODE_COUNT = 8;
/** Allows a code from the previous or next 30s step, absorbing normal clock drift between the
 * user's device and the server. */
const EPOCH_TOLERANCE_SECONDS = 30;

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

/** Consumes one backup code from the given user doc (member/practitioner/admin — whichever
 * DocumentReference the caller resolved), if it matches. Each code works once. */
export async function consumeBackupCode(ref: DocumentReference, code: string) {
  const snap = await ref.get();
  const codes = (snap.data()?.totpBackupCodes as string[] | undefined) ?? [];
  const digest = tokenDigest(code.trim().toUpperCase());
  if (!codes.includes(digest)) return false;
  await ref.update({ totpBackupCodes: codes.filter((existing) => existing !== digest) });
  return true;
}

/** Verifies either a live TOTP code or a one-time backup code against the given user doc. */
export async function verifyTotpOrBackupCode(ref: DocumentReference, secret: string, code: string) {
  const trimmed = code.trim();
  if (await verifyTotpCode(secret, trimmed)) return true;
  return trimmed.includes("-") && consumeBackupCode(ref, trimmed);
}

export type TwoFactorRole = "member" | "practitioner" | "admin";

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

/** Called right after a login route verifies an ID token and resolves the account's Firestore
 * doc, before minting a session. Returns a challenge token to hand back to the client (login
 * should stop there) when the account has 2FA enabled, or null when it's fine to proceed and
 * create the session immediately — including the common case of a doc that doesn't exist yet
 * (a brand-new member signing in for the first time can't have 2FA enabled). */
export async function checkTwoFactorGate(role: TwoFactorRole, uid: string, idToken: string, ref: DocumentReference) {
  const snap = await ref.get();
  if (snap.data()?.totpEnabled !== true) return null;
  return createTwoFactorChallenge(role, uid, idToken);
}
