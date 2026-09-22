-- 0006 — Kundli / Varshphal report cache columns on chat_sessions
--
-- practitioner-portal.ts caches a generated report back onto the source document
-- so the expensive solar-return calculation runs once per client per year instead
-- of once per page load. Four call sites do this
-- (practitioner-portal.ts:620, :670, :725, :775):
--
--     await ref.update({ kundliSummary, kundliGeneratedAt })                       -- bookings
--     await sessionRef.update({ kundliSummary, kundliGeneratedAt })                -- chatSessions
--     await ref.update({ varshphalSummary, varshphalYear, varshphalGeneratedAt })  -- bookings
--     await sessionRef.update({ varshphalSummary, varshphalYear,
--                               varshphalGeneratedAt })                            -- chatSessions
--
-- `bookings` already carries all five columns from 0001, because the BookingRecord
-- type declares them. `chat_sessions` carries none, because the ChatSessionRow
-- type in chat-supabase.ts does not — the report cache is not part of a chat
-- session's *pricing* shape, so deriving the schema from the types could not see
-- it. Same failure mode as 0005's refund_claimed_at: a field that exists only as
-- an ad-hoc cast at the write site.
--
-- Without these columns the copy script silently drops the cached reports on
-- every chatSessions document, and the ported chat-session report endpoints would
-- regenerate a full solar-return chart on every request instead of reading the
-- cache. Not data loss of anything money-bearing, but the practitioner-facing
-- Kundli/Varshphal PDF downloads would become needlessly slow, and a report
-- generated before cutover would differ from one generated after if the
-- underlying ephemeris data ever moves.
--
-- varshphal_year is the cache-invalidation key: unlike a Kundli, which never goes
-- stale, a Varshphal is year-scoped, so the stored summary is only reused when
-- varshphal_year still equals the current calendar year. It is nullable because
-- rows written before this column existed have no year to compare against, and
-- the reader treats null as "not cached".

alter table public.chat_sessions
  add column if not exists kundli_summary         text,
  add column if not exists kundli_generated_at    timestamptz,
  add column if not exists varshphal_summary      text,
  add column if not exists varshphal_year         integer,
  add column if not exists varshphal_generated_at timestamptz;

comment on column public.chat_sessions.kundli_summary is
  'Cached rendered Kundli report for the session''s client, generated from the client''s own member birth profile (chat sessions do not capture birth details at checkout, unlike bookings). Null until first generated. Never goes stale.';

comment on column public.chat_sessions.kundli_generated_at is
  'When kundli_summary was generated. Null means not yet generated.';

comment on column public.chat_sessions.varshphal_summary is
  'Cached rendered Varshphal (annual solar-return) report. Only reusable while varshphal_year equals the current calendar year.';

comment on column public.chat_sessions.varshphal_year is
  'Calendar year varshphal_summary was generated for. This is the cache key: a summary whose year is not the current year is discarded and regenerated. Null means not yet generated.';

comment on column public.chat_sessions.varshphal_generated_at is
  'When varshphal_summary was generated. Null means not yet generated.';
