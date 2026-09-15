import "server-only";

import { getAuth } from "firebase-admin/auth";

import { createAppSessionToken, type AppSessionSubject } from "@/lib/app-session";
import { revokeSessionsInSupabase, verifyAppSessionCookie } from "@/lib/app-session-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

/**
 * One place where the two session-cookie providers meet.
 *
 * admin-auth.ts, member-auth.ts and practitioner-auth.ts each used to call
 * Firebase's `createSessionCookie`, `verifySessionCookie` and
 * `revokeRefreshTokens` directly, and three more call sites revoke by uid. Gating
 * each of those eight sites independently would have been eight chances to branch
 * on the wrong condition or forget the revocation check; instead they all come
 * through here and there is exactly one `isSupabaseCutoverActive()` per operation.
 *
 * The shapes are deliberately the same on both paths: both throw when a cookie is
 * invalid, so the existing `try { … } catch { return null }` at every call site
 * keeps working unchanged.
 */

export type VerifiedSession = {
  uid: string;
  /** Present on both paths: Firebase's session cookie carries the ID-token claim
   * set, and the app-signed cookie carries this one claim deliberately. */
  emailVerified: boolean;
};

/** Mints the long-lived HTTP-only cookie value.
 *
 * The `idToken` is only used on the Firebase path — Firebase derives the cookie
 * from it. On the Supabase path the token has already been verified by the caller
 * (verifyAuthToken), and the cookie is signed from the verified uid instead. */
export async function issueSessionCookieValue(subject: AppSessionSubject, idToken: string, ttlMs: number): Promise<string> {
  if (isSupabaseCutoverActive()) return createAppSessionToken(subject, ttlMs);
  return getAuth().createSessionCookie(idToken, { expiresIn: ttlMs });
}

/** Verifies signature and expiry, and — when `checkRevoked` is true — rejects a
 * cookie issued before the user's sessions were revoked. */
export async function verifySessionCookieValue(cookie: string, checkRevoked: boolean): Promise<VerifiedSession> {
  if (isSupabaseCutoverActive()) {
    const payload = await verifyAppSessionCookie(cookie, checkRevoked);
    return { uid: payload.sub, emailVerified: payload.emailVerified };
  }
  const decoded = await getAuth().verifySessionCookie(cookie, checkRevoked);
  return { uid: decoded.uid, emailVerified: decoded.email_verified === true };
}

/** Invalidates every session this user currently holds.
 *
 * Used by logout and by the three administrative actions that must cut a user off
 * immediately: deactivating a member, accepting a practitioner invite under a new
 * uid, and removing an admin from the team. On the Supabase path this writes the
 * revocation marker that verifySessionCookieValue checks; it does not sign the
 * user's GoTrue browser session out, which the client does via @/lib/auth-client. */
export async function revokeAllUserSessions(uid: string): Promise<void> {
  if (isSupabaseCutoverActive()) {
    await revokeSessionsInSupabase(uid);
    return;
  }
  await getAuth().revokeRefreshTokens(uid);
}
