-- Columns the Firestore documents actually carry but the schema did not have.
--
-- The first nine migrations derived their columns from the TypeScript models, which
-- produces the shape you expect rather than the shape you have: a field only ever
-- reached through an untyped cast or a shorthand property never appears in a type.
-- These were found the other way round, by auditing every set()/update()/create()
-- payload and every where()/orderBy() field against the columns of the table the
-- copy script maps that collection to.
--
-- Every gap here is a silent data loss or a silent lockout at cutover, not an error:
-- the copy script filters an unmapped field and reports it at the end, so the row
-- still lands, just missing the field.

-- admin_users.active is the sign-in gate. admin-auth.ts returns null for any admin
-- whose document has active falsy, and the last-owner check in admin/team/[id] counts
-- only active owners, so without this column every copied admin reads as inactive and
-- is locked out of the admin at cutover with no error anywhere. Default true because
-- a missing value must not lock anyone out; the copy script carries the real value for
-- every document that has one.
alter table public.admin_users
  add column if not exists active boolean not null default true;

-- Permission fan-out filters on active and role together.
create index if not exists admin_users_role_active_idx
  on public.admin_users (role) where active;

-- Invite acceptance finds the row by token hash, not by id or email:
-- collection.where("tokenHash", "==", hash).where("acceptedAt", "==", null).
alter table public.admin_invites
  add column if not exists token_hash text;
create index if not exists admin_invites_token_hash_idx
  on public.admin_invites (token_hash) where token_hash is not null;

alter table public.practitioner_invites
  add column if not exists token_hash text;
create index if not exists practitioner_invites_token_hash_idx
  on public.practitioner_invites (token_hash) where token_hash is not null;

-- A referral document holds referrerId, refereeId, code, status, createdAt and
-- rewardedAt, and nothing else. member_id, referral_code, reference_type,
-- reference_id, amount and rewarded were inferred from a type and are never written
-- by any code path; the two NOT NULL constraints on them would have made every
-- copied referral row fail, aborting the whole collection.
--
-- Queries run on referrer_id (referral stats, and the rewarded-count inside the
-- payout transaction), so it needs an index of its own.
alter table public.referrals add column if not exists referrer_id text;
alter table public.referrals add column if not exists code text;
alter table public.referrals add column if not exists status text;
alter table public.referrals alter column member_id drop not null;
alter table public.referrals alter column referral_code drop not null;

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_id) where referrer_id is not null;

-- cosmic_weather persists the last computed house positions and reads them back on
-- the next visit to tell a genuine house change from a re-render of the same day.
alter table public.cosmic_weather add column if not exists houses jsonb;
alter table public.cosmic_weather add column if not exists updated_at timestamptz;
