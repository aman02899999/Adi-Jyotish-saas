import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createAppSessionToken } from "@/lib/app-session";
import {
  getSessionRevocationInSupabase,
  revokeSessionsInSupabase,
  verifyAppSessionCookie,
} from "@/lib/app-session-supabase";
import { closePgPool, query } from "@/lib/postgres";
import { issueSessionCookieValue, revokeAllUserSessions, verifySessionCookieValue } from "@/lib/session-cookie";

process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "session-revocation-itest-secret-0123456789";

/**
 * Revocation semantics for the app-signed session cookie. Skipped unless
 * SUPABASE_DB_URL points at a reachable database carrying migration 0007.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/session-revocation.integration.test.ts
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const USER = "session-revocation-itest-user";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Anchored to the real clock, not a fixed date: verifyAppSessionCookie verifies
// against Date.now(), so a hardcoded instant that sits ahead of the actual clock
// makes every token fail the "issued in the future" check instead of the
// revocation check it is meant to exercise.
const NOW = Date.now();
const NOW_S = Math.floor(NOW / 1000);
/** Whole seconds back from now. Used for cookies that must predate a revocation;
 * iat is second-granular, so a same-second cookie is deliberately ambiguous. */
const secondsAgo = (seconds: number) => (NOW_S - seconds) * 1000;

/** Seeds the revocation marker at an exact instant so the boundary cases are
 * deterministic instead of racing the clock. */
async function setRevocation(userId: string, at: Date) {
  await query(
    `insert into public.auth_session_revocations (user_id, revoked_before, updated_at)
     values ($1, $2, $2)
     on conflict (user_id) do update set revoked_before = $2, updated_at = $2`,
    [userId, at],
  );
}

async function cleanup() {
  await query(`delete from public.auth_session_revocations where user_id like $1`, ["session-revocation-itest-%"]);
}

beforeEach(async () => {
  if (!cutoverActive) return;
  await cleanup();
});

afterAll(async () => {
  if (!cutoverActive) return;
  await cleanup();
  await closePgPool();
});

describeCutover("session revocation", () => {
  it("accepts a cookie when nothing has been revoked", async () => {
    const cookie = createAppSessionToken({ uid: USER }, TTL_MS, NOW);
    const payload = await verifyAppSessionCookie(cookie, true);
    expect(payload.sub).toBe(USER);
    expect(await getSessionRevocationInSupabase(USER)).toBeNull();
  });

  it("rejects a cookie issued before the revocation instant", async () => {
    const cookie = createAppSessionToken({ uid: USER }, TTL_MS, secondsAgo(240));
    await setRevocation(USER, new Date(secondsAgo(120)));
    await expect(verifyAppSessionCookie(cookie, true)).rejects.toThrow("revoked");
  });

  it("still verifies signature and expiry when the caller does not ask about revocation", async () => {
    // The logout path only needs to learn who the cookie belongs to; making it
    // pay for a revocation lookup it is about to cause anyway would be waste.
    const cookie = createAppSessionToken({ uid: USER }, TTL_MS, secondsAgo(240));
    await setRevocation(USER, new Date(secondsAgo(120)));
    expect((await verifyAppSessionCookie(cookie, false)).sub).toBe(USER);
  });

  it("accepts a cookie issued after the user signed in again", async () => {
    await setRevocation(USER, new Date(secondsAgo(120)));
    const fresh = createAppSessionToken({ uid: USER }, TTL_MS, secondsAgo(60));
    expect((await verifyAppSessionCookie(fresh, true)).sub).toBe(USER);
  });

  it("accepts a cookie issued in the same second as the revocation", async () => {
    // iat is whole seconds, so the comparison floors the revocation instant. The
    // leniency runs to under a second and deliberately favours not locking out a
    // user who has just re-authenticated.
    await setRevocation(USER, new Date(NOW_S * 1000 + 900));
    const sameSecond = createAppSessionToken({ uid: USER }, TTL_MS, NOW_S * 1000);
    expect((await verifyAppSessionCookie(sameSecond, true)).sub).toBe(USER);
  });

  it("is idempotent", async () => {
    await revokeSessionsInSupabase(USER);
    await revokeSessionsInSupabase(USER);
    expect(await getSessionRevocationInSupabase(USER)).toBeInstanceOf(Date);
  });

  it("never moves the marker backwards", async () => {
    // greatest() in the upsert: a second, later-arriving revocation must not
    // un-revoke the cookies the first one already killed.
    const farFuture = new Date(Date.now() + 60 * 60 * 1000);
    await setRevocation(USER, farFuture);
    await revokeSessionsInSupabase(USER);
    const after = await getSessionRevocationInSupabase(USER);
    expect(after?.getTime()).toBeGreaterThanOrEqual(farFuture.getTime());
  });

  it("scopes revocation to one user", async () => {
    const other = `${USER}-other`;
    // Both cookies are a minute old so the revoked one is unambiguously older
    // than the revocation marker rather than landing in the same second as it.
    const mine = createAppSessionToken({ uid: USER }, TTL_MS, secondsAgo(60));
    const theirs = createAppSessionToken({ uid: other }, TTL_MS, secondsAgo(60));
    await revokeSessionsInSupabase(USER);

    await expect(verifyAppSessionCookie(mine, true)).rejects.toThrow("revoked");
    expect((await verifyAppSessionCookie(theirs, true)).sub).toBe(other);
  });

  it("keeps revocation recordable for a user whose profile row is gone", async () => {
    // The admin "remove from team" path revokes after deleting the account, which
    // is why user_id is not a foreign key.
    await revokeSessionsInSupabase("session-revocation-itest-deleted");
    expect(await getSessionRevocationInSupabase("session-revocation-itest-deleted")).toBeInstanceOf(Date);
  });
});

describeCutover("the provider branch in session-cookie.ts", () => {
  it("issues and verifies through the shared helper", async () => {
    const cookie = await issueSessionCookieValue({ uid: USER, emailVerified: true }, "unused-at-cutover", TTL_MS);
    const verified = await verifySessionCookieValue(cookie, true);
    expect(verified).toEqual({ uid: USER, emailVerified: true });
  });

  it("carries emailVerified=false rather than dropping the claim", async () => {
    // member-auth.ts reads this to decide whether to prompt for verification; a
    // dropped claim would nag every member on every page load.
    const cookie = await issueSessionCookieValue({ uid: USER }, "unused-at-cutover", TTL_MS);
    expect((await verifySessionCookieValue(cookie, true)).emailVerified).toBe(false);
  });

  it("revokes through the shared helper", async () => {
    const cookie = await issueSessionCookieValue({ uid: USER }, "unused-at-cutover", TTL_MS);
    // iat and revoked_before are both second-granular, and the comparison floors
    // the marker, so a cookie issued in the same second as the revocation is
    // accepted by design. Wait it out so this asserts the intended rejection.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await revokeAllUserSessions(USER);
    await expect(verifySessionCookieValue(cookie, true)).rejects.toThrow();
    // And the unrevoked path still resolves the uid, which is what logout needs.
    expect((await verifySessionCookieValue(cookie, false)).uid).toBe(USER);
  });
});
