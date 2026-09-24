import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { SESSION_SECRET_MIN_LENGTH } from "@/lib/supabase-config";

/**
 * The app's own session cookie.
 *
 * Firebase Auth signs session cookies for us and gives a central revocation
 * timestamp. GoTrue gives neither: its sessions are a localStorage access token
 * plus a refresh token, not a signed HTTP-only cookie. So at cutover the server
 * signs its own.
 *
 * Format is `asv1.<base64url(payload)>.<base64url(HMAC-SHA256(payload))>` with a
 * payload of `{ sub, iat, exp, emailVerified }`. There is no algorithm field to be confused by —
 * the only verification path is HMAC-SHA256 with this key, so the "alg: none" and
 * RS256→HS256 substitution attacks have nothing to substitute.
 *
 * The signing key is HKDF-derived from SUPABASE_JWT_SECRET with a distinct info
 * string, which keeps it domain-separated from the key that verifies GoTrue access
 * tokens (see auth-verify.ts) without introducing a tenth required secret. Using
 * that secret is not a new exposure: anyone holding it can already mint a GoTrue
 * access token this app accepts, so forging a session cookie grants nothing extra.
 * Rotating SUPABASE_JWT_SECRET therefore invalidates every session cookie, which
 * is the intended behaviour.
 *
 * This module is deliberately free of database and cookie access so the
 * cryptographic rules can be tested directly; revocation lives in
 * app-session-supabase.ts.
 */

const TOKEN_VERSION = "asv1";
const HKDF_SALT = "adi-jyotish.app-session";
const HKDF_INFO = "session-cookie-signing-key.v1";
const KEY_LENGTH_BYTES = 32;

/** Tolerance for clock skew between the issuing and verifying server. Matches the
 * skew auth-verify.ts allows on a GoTrue token's exp. */
const CLOCK_SKEW_SECONDS = 30;

export class AppSessionError extends Error {}

export type AppSessionPayload = {
  /** Auth uid the cookie authenticates. */
  sub: string;
  /** Issued-at, unix seconds. Compared against the revocation marker. */
  iat: number;
  /** Expiry, unix seconds. */
  exp: number;
  /** Whether the address was verified at sign-in. Firebase's session cookie
   * carries the whole ID-token claim set, and member-auth.ts reads this one to
   * decide whether to nag about verification — so it has to survive the swap
   * rather than silently become "unverified" for every Supabase member. */
  emailVerified: boolean;
};

/** What a caller knows about the user at the moment it issues a cookie. */
export type AppSessionSubject = {
  uid: string;
  emailVerified?: boolean;
};

function sessionKey(): Buffer {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret || secret.trim().length < SESSION_SECRET_MIN_LENGTH) {
    // Refuse rather than fall back to a default. A weak or predictable signing
    // key turns every session cookie into a forgery, and a silent fallback would
    // hide that behind a green health check.
    throw new AppSessionError("SUPABASE_JWT_SECRET is not configured, so session cookies cannot be issued or verified.");
  }
  return Buffer.from(hkdfSync("sha256", secret, HKDF_SALT, HKDF_INFO, KEY_LENGTH_BYTES));
}

/** Number.isInteger is not declared as a type guard in this lib, so validating a
 * claim with it does not narrow `unknown`. This wrapper does. */
function isIntegerClaim(value: unknown): value is number {
  return Number.isInteger(value);
}

function sign(payload: string): string {
  return createHmac("sha256", sessionKey()).update(payload).digest("base64url");
}

export function createAppSessionToken(subject: AppSessionSubject, ttlMs: number, now: number = Date.now()): string {
  if (!subject.uid) throw new AppSessionError("A session cookie needs a subject.");
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new AppSessionError("A session cookie needs a positive lifetime.");
  const iat = Math.floor(now / 1000);
  const exp = iat + Math.floor(ttlMs / 1000);
  const claims = { sub: subject.uid, iat, exp, emailVerified: subject.emailVerified === true };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${TOKEN_VERSION}.${payload}.${sign(payload)}`;
}

export function verifyAppSessionToken(token: string, now: number = Date.now()): AppSessionPayload {
  if (typeof token !== "string" || !token) throw new AppSessionError("Missing session cookie.");

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) throw new AppSessionError("Malformed session cookie.");
  const [, payload, signature] = parts;

  // Constant-time compare, and the length check has to come first because
  // timingSafeEqual throws on mismatched lengths instead of returning false.
  const given = Buffer.from(signature, "utf8");
  const expected = Buffer.from(sign(payload), "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new AppSessionError("Session cookie signature mismatch.");
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new AppSessionError("Malformed session cookie payload.");
  }
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    throw new AppSessionError("Malformed session cookie payload.");
  }

  const { sub, iat, exp, emailVerified } = claims as Record<string, unknown>;
  if (typeof sub !== "string" || !sub) throw new AppSessionError("Session cookie has no subject.");
  if (!isIntegerClaim(iat) || !isIntegerClaim(exp)) throw new AppSessionError("Malformed session cookie claims.");
  if (typeof emailVerified !== "boolean") throw new AppSessionError("Malformed session cookie claims.");

  const nowSeconds = Math.floor(now / 1000);
  if (exp <= nowSeconds) throw new AppSessionError("Session cookie has expired.");
  // An iat in the future is either clock skew or a forged claim crafted to outlive
  // a revocation timestamp, so bound it the same way exp is bounded.
  if (iat > nowSeconds + CLOCK_SKEW_SECONDS) throw new AppSessionError("Session cookie was issued in the future.");

  return { sub, iat, exp, emailVerified };
}
