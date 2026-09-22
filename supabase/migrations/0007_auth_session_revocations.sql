-- =============================================================================
-- Migration 0007 — session revocation for app-issued session cookies
--
-- Firebase Auth's session cookies are signed by Firebase and revoked centrally:
-- `verifySessionCookie(cookie, true)` rejects any cookie issued before the user's
-- `tokensValidAfterTime`, and `revokeRefreshTokens(uid)` moves that timestamp to
-- "now", killing every live cookie and refresh token for that user at once.
--
-- GoTrue has no equivalent. Its browser sessions are a localStorage access token
-- plus a refresh token, not a signed HTTP-only cookie, and there is no
-- "invalidate everything issued before T" primitive reachable from the admin API.
-- So the app mints its own signed cookie (src/lib/app-session.ts) and needs its
-- own revocation marker.
--
-- This table is that marker: one row per user holding the instant at which all of
-- their previously issued session cookies became invalid. Verification compares
-- the cookie's `iat` against `revoked_before` and rejects anything older. It
-- reproduces the Firebase semantics exactly, including the one that matters: a
-- user who is deactivated, or whose payout destination was changed by someone
-- else, loses access on their next request rather than seven days later.
--
-- Absence of a row means "nothing revoked", which is the common case and keeps
-- the verification path to a single indexed lookup that usually finds nothing.
--
-- This table deliberately does NOT revoke the GoTrue browser session. The client
-- signs that out through @/lib/auth-client; server-rendered pages are gated by the
-- app cookie this table controls.
-- =============================================================================

create table if not exists public.auth_session_revocations (
  user_id        text        primary key,
  revoked_before timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.auth_session_revocations is
  'App-issued session cookies with iat < revoked_before are rejected. One row per user, upserted on revocation. Absence of a row means nothing has been revoked for that user.';

comment on column public.auth_session_revocations.user_id is
  'Auth uid (a GoTrue uuid after the auth migration). Not a foreign key: revocation must be recordable for a uid whose profile row was just deleted, which is one of the two call sites.';

comment on column public.auth_session_revocations.revoked_before is
  'Session cookies issued strictly before this instant are invalid. Set to now() at revocation time; never moved backwards.';

-- Deny-all, same as every other table: RLS enabled with no policies, so any role
-- without BYPASSRLS sees zero rows. Server code connects with a bypassing role.
alter table public.auth_session_revocations enable row level security;
