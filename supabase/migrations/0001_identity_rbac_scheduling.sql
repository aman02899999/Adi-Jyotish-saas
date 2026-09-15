-- =============================================================================
-- Migration 0001 — Identity, RBAC, practitioners, scheduling
-- Adi Jyotish SaaS — Firebase → Supabase (Postgres)
--
-- DERIVED, NOT RECOVERED. The repo contained no SQL when this was written; every
-- column below was read out of the Firestore TypeScript document models in
-- src/lib/*.ts. Sources are cited per table.
--
-- CONVENTIONS (apply to all four migration files):
--   * Every primary key is `text` and holds the Firestore document id verbatim, so
--     the copy scripts need no id translation. The ONLY remap at cutover is the
--     auth-uid pass through auth_uid_map (created in 0004).
--   * Column names are snake_case; Firestore field names are camelCase. The copy
--     script maps mechanically: camelCase -> snake_case, no exceptions.
--   * Firestore Timestamp -> timestamptz. Firestore *string* dates (birthDate,
--     birthTime, entryDate, horoscope date) stay `text` — the app stores them as
--     opaque strings and parses them itself, so converting them would change
--     behaviour.
--   * Firestore string arrays that the app already joins into a single string
--     (specialties, languages, consultationModes, features, categorySlugs) stay
--     `text` for the same reason.
--   * Money is numeric(14,2). Firestore numbers are floats, but every value in
--     this domain is a currency amount or a count; numeric avoids float drift on
--     re-summation after the copy.
--   * RLS is enabled on every table with no permissive policy, i.e. deny-all for
--     anon/authenticated. Server code uses the service_role key, which bypasses
--     RLS. Add policies deliberately later — do not open these up to the browser.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- -----------------------------------------------------------------------------
-- members  (src/lib/member-auth.ts:33 MemberDoc; MemberIdentity)
-- Document id == Firebase Auth uid.
-- -----------------------------------------------------------------------------
create table if not exists public.members (
  id                    text primary key,
  name                  text        not null,
  email                 citext      not null,
  phone                 text,
  birth_date            text,
  birth_time            text,
  birth_place           text,
  plan                  text        not null default 'free',
  onboarding_complete   boolean     not null default false,
  active                boolean     not null default true,
  email_verified        boolean     not null default false,
  totp_enabled          boolean     not null default false,
  totp_secret           text,
  totp_pending_secret   text,
  totp_backup_codes     text[]      not null default '{}',
  payment_bypass        boolean     not null default false,
  is_demo_account       boolean     not null default false,
  session_revoked       boolean     not null default false,
  locale                text,
  referral_code         text,
  last_login_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists members_email_key on public.members (email);
create unique index if not exists members_referral_code_key on public.members (referral_code) where referral_code is not null;

-- -----------------------------------------------------------------------------
-- admin_users  (AdminIdentity; writes in src/app/api/admin/**)
-- Document id == Firebase Auth uid of the admin.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_users (
  id                        text primary key,
  name                      text        not null,
  email                     citext      not null,
  role                      text        not null default 'viewer',
  permissions               jsonb       not null default '[]'::jsonb,
  acting_admin_role         text,
  acting_admin_permissions  jsonb,
  totp_enabled              boolean     not null default false,
  totp_secret               text,
  totp_pending_secret       text,
  totp_backup_codes         text[]      not null default '{}',
  backup_codes              text[]      not null default '{}',
  session_revoked           boolean     not null default false,
  is_demo_account           boolean     not null default false,
  firebase_uid              text,
  last_login_at             timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create unique index if not exists admin_users_email_key on public.admin_users (email);

-- -----------------------------------------------------------------------------
-- admin_roles  (src/lib/admin-roles.ts AdminRoleRow)
-- admin_count is a denormalised roll-up the app maintains; keep it nullable-safe.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_roles (
  id          text primary key,
  slug        text        not null,
  name        text        not null,
  is_system   boolean     not null default false,
  permissions jsonb       not null default '[]'::jsonb,
  admin_count integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists admin_roles_slug_key on public.admin_roles (slug);

-- -----------------------------------------------------------------------------
-- admin_invites  (src/lib/admin-invites.ts AdminInvite)
-- -----------------------------------------------------------------------------
create table if not exists public.admin_invites (
  id         text primary key,
  email      citext      not null,
  role       text        not null,
  invited_by text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_invites_email_idx on public.admin_invites (email);

-- -----------------------------------------------------------------------------
-- practitioner_invites  (src/lib/practitioner-invites.ts)
-- -----------------------------------------------------------------------------
create table if not exists public.practitioner_invites (
  id                text primary key,
  email             citext      not null,
  practitioner_slug text        not null,
  invited_by        text,
  expires_at        timestamptz not null,
  accepted_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists practitioner_invites_email_idx on public.practitioner_invites (email);

-- -----------------------------------------------------------------------------
-- practitioners  (src/lib/marketplace.ts Practitioner)
-- Payout/bank fields are written by src/lib/practitioner-portal.ts and stored
-- ENCRYPTED (the *Enc suffixed columns); the plaintext columns exist only on
-- older documents. Keep both — the copy must not lose either.
-- -----------------------------------------------------------------------------
create table if not exists public.practitioners (
  id                       text primary key,
  name                     text        not null,
  slug                     text        not null,
  email                    citext      not null,
  title                    text        not null default '',
  bio                      text        not null default '',
  specialties              text        not null default '',
  languages                text        not null default '',
  consultation_modes       text        not null default '',
  experience_years         integer     not null default 0,
  verified                 boolean     not null default false,
  verification_level       text        not null default 'none',
  photo_url                text,
  video_url                text,
  online                   boolean     not null default false,
  is_ai_powered            boolean     not null default false,
  chat_rate_per_minute     numeric(14,2) not null default 0,
  active                   boolean     not null default true,
  featured                 boolean     not null default false,
  is_demo_account          boolean     not null default false,
  firebase_uid             text,
  has_portal_access        boolean     not null default false,
  requires_totp            boolean     not null default false,
  totp_enabled             boolean     not null default false,
  totp_secret              text,
  totp_pending_secret      text,
  totp_backup_codes        text[]      not null default '{}',
  backup_codes             text[]      not null default '{}',
  session_revoked          boolean     not null default false,
  email_verified           boolean     not null default false,
  bank_account_name        text,
  bank_account_number      text,
  bank_account_number_enc  text,
  bank_ifsc                text,
  upi_id                   text,
  upi_id_enc               text,
  payout_details_updated_at timestamptz,
  last_login_at            timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index if not exists practitioners_slug_key on public.practitioners (slug);
create unique index if not exists practitioners_email_key on public.practitioners (email);
create index if not exists practitioners_active_featured_idx on public.practitioners (active, featured);
create index if not exists practitioners_firebase_uid_idx on public.practitioners (firebase_uid) where firebase_uid is not null;

-- -----------------------------------------------------------------------------
-- availability_rules  (src/lib/scheduling.ts AvailabilityRule)
-- Firestore subcollection: practitioners/{slug}/availabilityRules
-- -----------------------------------------------------------------------------
create table if not exists public.availability_rules (
  id             text primary key,
  practitioner_id text       not null references public.practitioners (id) on delete cascade,
  weekday        smallint   not null check (weekday between 0 and 6),
  start_time     text       not null,
  end_time       text       not null,
  active         boolean    not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists availability_rules_practitioner_idx on public.availability_rules (practitioner_id, weekday);

-- -----------------------------------------------------------------------------
-- practitioner_time_off  (src/lib/practitioner-portal.ts PractitionerTimeOff)
-- Firestore subcollection: practitioners/{slug}/timeOff
-- -----------------------------------------------------------------------------
create table if not exists public.practitioner_time_off (
  id              text primary key,
  practitioner_id text        not null references public.practitioners (id) on delete cascade,
  -- Nullable on purpose. Firestore time-off documents predate the startsAt field,
  -- and the app already falls back to endsAt when it is missing
  -- (scheduling.ts: `startsAt: data.startsAt?.toDate() ?? data.endsAt.toDate()`).
  -- A NOT NULL here made the copy script abort the whole time-off batch on those
  -- documents. The ends_at > starts_at check still holds: a NULL comparison is
  -- not false, so the row is accepted.
  starts_at       timestamptz,
  ends_at         timestamptz not null,
  reason          text,
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists practitioner_time_off_practitioner_idx on public.practitioner_time_off (practitioner_id, starts_at);

-- -----------------------------------------------------------------------------
-- services  (src/lib/services.ts Service)
-- Placed here because bookings in 0002 reference it and Postgres needs the
-- parent to exist first.
-- -----------------------------------------------------------------------------
create table if not exists public.services (
  id          text primary key,
  title       text        not null,
  slug        text        not null,
  category    text        not null default '',
  description text        not null default '',
  price       numeric(14,2) not null default 0,
  duration    integer     not null default 30,
  icon        text        not null default '',
  active      boolean     not null default true,
  featured    boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists services_slug_key on public.services (slug);

-- -----------------------------------------------------------------------------
-- Row level security: deny everything. service_role bypasses; the app never
-- exposes these tables to the browser directly.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'members','admin_users','admin_roles','admin_invites','practitioner_invites',
    'practitioners','availability_rules','practitioner_time_off','services'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
