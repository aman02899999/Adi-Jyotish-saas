import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getSupabaseConfig, isSupabaseCutoverActive } from "@/lib/supabase-config";

/**
 * Verifies the token the browser hands us, whichever auth provider issued it.
 *
 * During the migration both providers are live: accounts that have been through
 * scripts/migrate-auth-users.mjs authenticate against Supabase, and everything
 * else still authenticates against Firebase Auth. The 13 call sites across the
 * API used to call `getAuth().verifyIdToken(token, true)` directly; they now call
 * verifyAuthToken() so the provider is decided in one place.
 *
 * WHY NOT A LIBRARY. Next.js pins `jose` through a package override, so adding it
 * as a direct dependency fails with EOVERRIDE. HS256 verification is a small,
 * auditable amount of code, and keeping it here means the exact checks applied to
 * a bearer token are visible in this repo rather than implied by a dependency.
 *
 * THE SECURITY-CRITICAL PART. A JWT's payload is readable by anyone — it is
 * signed, not encrypted. decodeUnverifiedJwt() below is used ONLY to choose which
 * verifier to run. Nothing from it is trusted: verifySupabaseAccessToken()
 * re-checks the signature before it will return anything, and a token whose
 * issuer names neither provider is rejected rather than passed through.
 */

export type VerifiedAuth = {
  /** The uid to look the account up by — the Supabase user id or the Firebase uid. */
  uid: string;
  issuer: "firebase" | "supabase";
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  /** "google.com" under Firebase, "google" under Supabase — see signInProviderIsGoogle. */
  signInProvider: string | null;
};

/**
 * True when the account was created by a Google sign-in.
 *
 * The two providers name the same thing differently ("google.com" vs "google"),
 * and practitioner-google-login uses this to refuse a password-created account
 * claiming to be a Google login. Normalising here keeps that check correct across
 * the migration instead of quietly passing for one provider and failing for the
 * other.
 */
export function signInProviderIsGoogle(provider: string | null): boolean {
  return provider === "google.com" || provider === "google";
}

export class AuthTokenVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthTokenVerificationError";
  }
}

/** Clock skew tolerated on exp/nbf, in seconds. */
const LEEWAY_SECONDS = 30;

function base64UrlDecode(segment: string): Buffer {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

function base64UrlEncode(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type JwtParts = { header: Record<string, unknown>; payload: Record<string, unknown> };

/**
 * Reads a JWT's header and payload WITHOUT verifying the signature.
 *
 * Only ever use this to decide how to verify. Returns null for anything that is
 * not three dot-separated base64url segments of parseable JSON.
 */
export function decodeUnverifiedJwt(token: string): JwtParts | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8")) as Record<string, unknown>;
    const payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8")) as Record<string, unknown>;
    if (typeof header !== "object" || header === null) return null;
    if (typeof payload !== "object" || payload === null) return null;
    return { header, payload };
  } catch {
    return null;
  }
}

/** The issuer GoTrue stamps on its access tokens, for a given project URL. */
export function supabaseIssuer(projectUrl: string): string {
  return `${projectUrl.replace(/\/+$/, "")}/auth/v1`;
}

/**
 * True when the token's (unverified) issuer claim names this Supabase project.
 * Used only to pick the verifier — verifySupabaseAccessToken still has to pass.
 */
export function looksLikeSupabaseToken(token: string, projectUrl: string): boolean {
  const decoded = decodeUnverifiedJwt(token);
  return decoded?.payload.iss === supabaseIssuer(projectUrl);
}

export type SupabaseVerifyOptions = {
  projectUrl: string;
  jwtSecret: string;
  /** Epoch seconds; injectable so expiry can be tested. */
  now?: number;
  leewaySeconds?: number;
};

/**
 * Verifies a Supabase (GoTrue) access token: HS256 signature, issuer, audience,
 * expiry, and presence of a subject.
 *
 * Throws AuthTokenVerificationError on any failure — it never returns an
 * unverified identity.
 */
export function verifySupabaseAccessToken(token: string, options: SupabaseVerifyOptions): VerifiedAuth {
  const { projectUrl, jwtSecret } = options;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const leeway = options.leewaySeconds ?? LEEWAY_SECONDS;

  if (!jwtSecret) throw new AuthTokenVerificationError("SUPABASE_JWT_SECRET is not configured.");

  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3) throw new AuthTokenVerificationError("Malformed token.");
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  const decoded = decodeUnverifiedJwt(token);
  if (!decoded) throw new AuthTokenVerificationError("Malformed token.");

  // Reject alg confusion up front. GoTrue signs with HS256; accepting "none" or an
  // asymmetric alg here would let a crafted header downgrade the check.
  if (decoded.header.alg !== "HS256") throw new AuthTokenVerificationError("Unsupported token algorithm.");

  const expected = base64UrlEncode(createHmac("sha256", jwtSecret).update(`${headerSegment}.${payloadSegment}`).digest());
  const provided = Buffer.from(signatureSegment);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
    throw new AuthTokenVerificationError("Token signature is invalid.");
  }

  const payload = decoded.payload;
  if (payload.iss !== supabaseIssuer(projectUrl)) throw new AuthTokenVerificationError("Token issuer is not this project.");
  // GoTrue issues "authenticated" for signed-in users and "anon" for the public key.
  if (payload.aud !== "authenticated") throw new AuthTokenVerificationError("Token audience is not an authenticated user.");

  const exp = typeof payload.exp === "number" ? payload.exp : null;
  if (exp === null) throw new AuthTokenVerificationError("Token has no expiry.");
  if (exp + leeway < now) throw new AuthTokenVerificationError("Token has expired.");

  const nbf = typeof payload.nbf === "number" ? payload.nbf : null;
  if (nbf !== null && nbf - leeway > now) throw new AuthTokenVerificationError("Token is not valid yet.");

  const sub = payload.sub;
  if (typeof sub !== "string" || sub === "") throw new AuthTokenVerificationError("Token has no subject.");

  const userMetadata = (payload.user_metadata ?? {}) as Record<string, unknown>;
  const appMetadata = (payload.app_metadata ?? {}) as Record<string, unknown>;
  const name = userMetadata.full_name ?? userMetadata.name;

  return {
    uid: sub,
    issuer: "supabase",
    email: typeof payload.email === "string" ? payload.email : null,
    // GoTrue stamps email_verified; treat an absent claim as unverified rather
    // than assuming the address was confirmed.
    emailVerified: payload.email_verified === true,
    name: typeof name === "string" ? name : null,
    picture: typeof userMetadata.avatar_url === "string" ? userMetadata.avatar_url : null,
    signInProvider: typeof appMetadata.provider === "string" ? appMetadata.provider : null,
  };
}

/**
 * Verifies whichever provider issued the token and returns the uid to look the
 * account up by.
 *
 * Under cutover a Supabase token is accepted; a Firebase token still verifies, so
 * the two can coexist while accounts are migrated. With cutover off, only Firebase
 * tokens are accepted — the behaviour the app has today.
 */
export async function verifyAuthToken(token: string): Promise<VerifiedAuth> {
  if (typeof token !== "string" || token.trim() === "") {
    throw new AuthTokenVerificationError("No token supplied.");
  }

  const config = getSupabaseConfig();
  if (isSupabaseCutoverActive() && config && looksLikeSupabaseToken(token, config.url)) {
    return verifySupabaseAccessToken(token, { projectUrl: config.url, jwtSecret: process.env.SUPABASE_JWT_SECRET ?? "" });
  }

  try {
    const decoded = await getAuth().verifyIdToken(token, true);
    const firebase = (decoded.firebase ?? {}) as { sign_in_provider?: unknown };
    return {
      uid: decoded.uid,
      issuer: "firebase",
      email: typeof decoded.email === "string" ? decoded.email : null,
      emailVerified: decoded.email_verified === true,
      name: typeof decoded.name === "string" ? decoded.name : null,
      picture: typeof decoded.picture === "string" ? decoded.picture : null,
      signInProvider: typeof firebase.sign_in_provider === "string" ? firebase.sign_in_provider : null,
    };
  } catch (error) {
    // Preserve the caller's existing behaviour: any verification failure is just
    // "bad credentials". The routes already map this to a 401.
    throw new AuthTokenVerificationError(error instanceof Error ? error.message : "Token could not be verified.");
  }
}
