-- =============================================================================
-- Migration 0009 — audit_logs.details
--
-- Same class as 0005, 0006 and 0008: the schema was derived from the TypeScript
-- types, and `auditLogs` is written by four call sites that build their document
-- literals inline rather than through a shared type, so the derivation never saw
-- the shape.
--
-- Every writer passes `details`:
--
--     await db.collection("auditLogs").add({
--       adminId, adminName, action, entityType, entityId,
--       details: details ? JSON.stringify(details).slice(0, 4000) : null,
--       createdAt: FieldValue.serverTimestamp(),
--     });                                                  // admin-auth.ts:139
--
-- (also src/app/api/member/bookings/[id]/route.ts:29,
--  src/app/api/member/messages/[id]/route.ts:23,
--  src/app/api/member/messages/route.ts:22)
--
-- and the admin Activity page renders it as the "what changed" column:
--
--     if (entry.details) details = Object.entries(JSON.parse(entry.details)) ...
--     <small title={details}>{details}</small>     // admin/(protected)/activity/page.tsx:37-45
--
-- 0004 created audit_logs with `before` and `after` jsonb columns instead — a
-- plausible audit shape that nothing in src/ has ever written. So the real field
-- had no column and the two columns that exist hold nothing.
--
-- Without this, the copy script's stray-field filter drops `details` from every
-- row and reports it in the end-of-run summary — data loss on the entire audit
-- trail, surfaced only if the operator reads that summary. And recordAudit cannot
-- be ported at all until the column exists.
--
-- `details` stays `text`, not jsonb, because the writer stores a JSON *string*
-- (JSON.stringify, truncated at 4000 characters) and the reader parses that
-- string back. A truncated jsonb cast would fail on any entry cut mid-token.
--
-- `before` and `after` are left in place and left nullable. They hold nothing and
-- cost nothing; dropping them is a separate decision for whoever owns the schema.
-- =============================================================================

alter table public.audit_logs
  add column if not exists details text;

comment on column public.audit_logs.details is
  'Free-form JSON *string* describing the change, truncated at 4000 characters by the writer and JSON.parsed by the admin Activity page. text rather than jsonb because truncation can leave it mid-token.';

comment on column public.audit_logs.before is
  'Not written by anything in src/. Retained as nullable; see migration 0009.';

comment on column public.audit_logs.after is
  'Not written by anything in src/. Retained as nullable; see migration 0009.';
