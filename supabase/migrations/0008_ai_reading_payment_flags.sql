-- =============================================================================
-- Migration 0008 — ai_readings payment-source flags, and the free-reading claim
--                    columns the documents do not actually carry
--
-- Both problems are the same class as 0005 and 0006: the schema was derived from
-- the TypeScript types, and Firestore is schemaless, so fields written through an
-- ad-hoc cast or living only in a document id are invisible to that derivation.
--
-- 1. ai_readings.paid_via_bypass / paid_from_wallet
--
-- ai-readings.ts writes these two flags but never declares them:
--
--     await ref.update({ status: "paid", paidViaBypass: true });    // :576
--     await ref.update({ status: "paid", paidFromWallet: true });   // :596
--
-- Neither is in the `AiReading` or `AiReadingDoc` types, so 0004 created
-- ai_readings without them. They are not cosmetic: they are the only record of
-- *how* a reading was paid for. `paidViaBypass` marks a QA account that skipped
-- the charge entirely (lib/payment-bypass.ts gates it on a member flag plus a
-- deployment env var), and the code comment at the write site is explicit that
-- the row must "record that so it is never mistaken for revenue". Without the
-- column, a bypassed reading is indistinguishable from real ₹99–₹999 revenue in
-- every report and every reconciliation.
--
-- 2. ai_reading_free_claims.member_id
--
-- The app writes exactly one field to this collection:
--
--     await freeReadingClaims.doc(memberId).create({ createdAt: ... })   // :181
--
-- The member id lives ONLY in the document id, which becomes the primary key.
-- `persona_id` and `reading_id` are never written by anything in src/ — nothing
-- even reads this table; its whole purpose is that inserting a row with an
-- existing primary key fails, which is what makes the free reading
-- once-per-member. Declaring member_id `not null` therefore made the collection
-- uncopiable: every copied row would arrive with member_id null and abort the
-- batch mid-cutover. Same fix as gemstone_coupon_customer_usage in 0005.
-- =============================================================================

alter table public.ai_readings
  add column if not exists paid_via_bypass boolean not null default false,
  add column if not exists paid_from_wallet boolean not null default false;

comment on column public.ai_readings.paid_via_bypass is
  'True when the reading was marked paid without any charge, by an account carrying the QA payment bypass (lib/payment-bypass.ts). Must never be counted as revenue.';

comment on column public.ai_readings.paid_from_wallet is
  'True when the reading was settled from the member''s wallet rather than a Razorpay checkout. razorpay_payment_id stays null on these rows, so this flag is the only way to tell a wallet payment from an unpaid one.';

alter table public.ai_reading_free_claims
  alter column member_id drop not null;

comment on column public.ai_reading_free_claims.member_id is
  'Denormalised out of the primary key, which IS the member id. Firestore never stored it as a field, so copied rows arrive null until the post-copy backfill runs. Not read by the application — the table exists purely so a duplicate insert fails.';

comment on column public.ai_reading_free_claims.persona_id is
  'Never written by anything in src/. Retained so the rows are legible in a database client.';

comment on column public.ai_reading_free_claims.reading_id is
  'Never written by anything in src/. Retained so the rows are legible in a database client.';

-- Backfill, idempotent. Run AFTER scripts/migrate-firestore-to-supabase.mjs, not
-- as part of the migration: the rows have to exist first. The document id IS the
-- member id here, so unlike the coupon usage table there is no prefix to strip.
--
--   update public.ai_reading_free_claims
--      set member_id = id
--    where member_id is null;
