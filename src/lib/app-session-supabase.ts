import "server-only";

import { query } from "@/lib/postgres";
import { AppSessionError, verifyAppSessionToken, type AppSessionPayload } from "@/lib/app-session";

/**
 * Revocation for the app's own session cookies.
 *
 * Firebase keeps a per-user "tokens valid after" timestamp and
 * `verifySessionCookie(cookie, true)` checks it. This is that timestamp, stored
 * where we can reach it: one row per user, compared against the cookie's iat.
 */

export async function getSessionRevocationInSupabase(userId: string): Promise<Date | null> {
  const result = await query(
    "select revoked_before from public.auth_session_revocations where user_id = $1",
    [userId],
  );
  const value = result.rows[0]?.revoked_before;
  return value ? new Date(value as string | Date) : null;
}

/** Kills every app session cookie this user already holds. Upsert, so revoking
 * twice is idempotent and two concurrent revocations cannot fail on the primary
 * key. `greatest()` keeps the marker monotonic: a revocation must never move
 * backwards and un-revoke cookies an earlier call already invalidated. */
export async function revokeSessionsInSupabase(userId: string): Promise<void> {
  await query(
    `insert into public.auth_session_revocations (user_id, revoked_before, updated_at)
     values ($1, now(), now())
     on conflict (user_id) do update
        set revoked_before = greatest(public.auth_session_revocations.revoked_before, now()),
            updated_at = now()`,
    [userId],
  );
}

/** Signature and expiry first, then — only when the caller asked — the revocation
 * lookup. Most call sites do not need it, and skipping the query keeps the common
 * path free of a round trip. */
export async function verifyAppSessionCookie(cookie: string, checkRevoked: boolean): Promise<AppSessionPayload> {
  const payload = verifyAppSessionToken(cookie);
  if (!checkRevoked) return payload;

  const revokedBefore = await getSessionRevocationInSupabase(payload.sub);
  if (revokedBefore && payload.iat < Math.floor(revokedBefore.getTime() / 1000)) {
    throw new AppSessionError("Session cookie was revoked.");
  }
  return payload;
}
