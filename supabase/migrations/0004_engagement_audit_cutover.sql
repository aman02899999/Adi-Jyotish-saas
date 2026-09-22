-- =============================================================================
-- Migration 0004 — Chat, AI readings, messaging, engagement, audit, and the
--                  cutover helper (auth_uid_map)
-- Adi Jyotish SaaS — Firebase → Supabase (Postgres)
--
-- Same conventions as 0001/0002/0003.
--
-- THREE TABLES ENFORCE CONCURRENCY BY EXISTENCE, not by a status column:
--   chat_active_locks      (src/lib/chat.ts:168-178)  — doc id == memberId, and
--     Firestore's create-fails-if-exists IS the lock. Two concurrent
--     start-session calls must not both succeed. The unique primary key below is
--     what preserves that; do not relax it to a non-unique index.
--   razorpay_events        (0002)                     — same pattern, keyed by event id.
--   gemstone_coupon_customer_usage (0003)             — same pattern, keyed by
--     `${couponCode}_${identifier}`.
-- Postgres gives you the same guarantee via the primary key, but the app must
-- switch from "catch already-exists" to "catch unique_violation (23505)". That is
-- a code change required at cutover, not something this migration can do for you.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- chat_sessions  (src/lib/chat.ts:47 ChatSession)
-- -----------------------------------------------------------------------------
create table if not exists public.chat_sessions (
  id               text primary key,
  member_id        text        not null references public.members (id) on delete cascade,
  practitioner_id  text        not null references public.practitioners (id) on delete cascade,
  wallet_hold_id   text        references public.wallet_holds (id) on delete set null,
  pricing_model    text        not null default 'metered' check (pricing_model in ('metered','fixed')),
  rate_per_minute  numeric(14,2) not null default 0,
  fixed_price      numeric(14,2),
  status           text        not null default 'active',
  captured_amount  numeric(14,2),
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists chat_sessions_member_idx on public.chat_sessions (member_id, created_at desc);
create index if not exists chat_sessions_practitioner_idx on public.chat_sessions (practitioner_id, status);
create index if not exists chat_sessions_active_idx on public.chat_sessions (status) where status = 'active';

-- -----------------------------------------------------------------------------
-- chat_active_locks  (src/lib/chat.ts:168-178)
-- Doc id == memberId. ONE row per member with an active chat, enforced by the PK.
-- -----------------------------------------------------------------------------
create table if not exists public.chat_active_locks (
  member_id  text primary key references public.members (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- chat_messages  (src/lib/chat.ts:67 ChatMessage)
-- Firestore subcollection: chatSessions/{id}/messages
-- -----------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id          text primary key,
  session_id  text        not null references public.chat_sessions (id) on delete cascade,
  sender_type text        not null check (sender_type in ('member','practitioner','system')),
  sender_name text        not null default '',
  body        text        not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_session_created_idx on public.chat_messages (session_id, created_at);

-- -----------------------------------------------------------------------------
-- ai_personas  (src/lib/ai-personas.ts AiPersona)
-- sample_questions is a real Firestore string array, so text[] is faithful here
-- (unlike specialties/languages, which the app joins into one string).
-- -----------------------------------------------------------------------------
create table if not exists public.ai_personas (
  id              text primary key,
  slug            text        not null,
  name            text        not null,
  title           text        not null default '',
  avatar_url      text,
  description     text        not null default '',
  system_prompt   text        not null default '',
  sample_questions text[]     not null default '{}',
  price           numeric(14,2) not null default 0,
  currency        text        not null default 'INR',
  active          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists ai_personas_slug_key on public.ai_personas (slug);

-- -----------------------------------------------------------------------------
-- ai_readings  (src/lib/ai-readings.ts:30 AiReading)
-- tarot_cards is a TarotCardDraw[] and face_image_paths a string[]; both are
-- stored as jsonb to keep the copy a straight serialisation.
-- -----------------------------------------------------------------------------
create table if not exists public.ai_readings (
  id                    text primary key,
  member_id             text        not null references public.members (id) on delete cascade,
  reading_type          text        not null,
  client_name           text        not null default '',
  birth_date            text,
  birth_time            text,
  birth_place           text,
  question              text,
  left_palm_image_path  text,
  right_palm_image_path text,
  tarot_cards           jsonb,
  face_image_paths      jsonb,
  persona_id            text        references public.ai_personas (id) on delete set null,
  persona_slug          text,
  persona_name          text,
  year                  integer,
  price                 numeric(14,2) not null default 0,
  currency              text        not null default 'INR',
  status                text        not null default 'pending',
  razorpay_order_id     text,
  razorpay_payment_id   text,
  answer                text,
  answered_at           timestamptz,
  reminder_sent_at      timestamptz,
  ai_attempts           integer     not null default 0,
  last_ai_error         text,
  created_at            timestamptz not null default now()
);
create index if not exists ai_readings_member_idx on public.ai_readings (member_id, created_at desc);
create index if not exists ai_readings_status_idx on public.ai_readings (status) where status in ('pending','processing');
create unique index if not exists ai_readings_razorpay_order_key
  on public.ai_readings (razorpay_order_id) where razorpay_order_id is not null;

-- -----------------------------------------------------------------------------
-- ai_reading_free_claims  (INFERRED — src/lib/ai-readings.ts free-tier path)
-- One free reading per member per persona. The unique index is the enforcement;
-- without it the free tier is unlimited.
-- -----------------------------------------------------------------------------
create table if not exists public.ai_reading_free_claims (
  id          text primary key,
  member_id   text        not null references public.members (id) on delete cascade,
  persona_id  text,
  reading_id  text        references public.ai_readings (id) on delete set null,
  claimed_at  timestamptz not null default now(),
  unique (member_id, persona_id)
);

-- -----------------------------------------------------------------------------
-- notifications  (src/lib/notifications.ts:8 NotificationDoc)
-- recipient_type + recipient_id is a polymorphic pointer (member OR practitioner
-- OR admin). Deliberately NOT a foreign key — it spans three tables.
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id             text primary key,
  recipient_type text        not null check (recipient_type in ('member','practitioner','admin')),
  recipient_id   text        not null,
  type           text        not null,
  title          text        not null default '',
  body           text,
  link           text,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_type, recipient_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (recipient_type, recipient_id) where read_at is null;

-- -----------------------------------------------------------------------------
-- message_threads  (src/lib/messaging.ts InboxThread)
-- The InboxThread type carries a `messages` array, but that is the hydrated view
-- built from the messages subcollection — it is NOT a stored field. Do not copy
-- it into a column.
-- -----------------------------------------------------------------------------
create table if not exists public.message_threads (
  id              text primary key,
  member_id       text        not null references public.members (id) on delete cascade,
  booking_id      text        references public.bookings (id) on delete set null,
  subject         text        not null default '',
  category        text        not null default 'general',
  status          text        not null default 'open',
  member_name     text        not null default '',
  member_email    citext      not null default '',
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists message_threads_member_idx on public.message_threads (member_id, last_message_at desc);
create index if not exists message_threads_status_idx on public.message_threads (status, last_message_at desc);

-- -----------------------------------------------------------------------------
-- inbox_messages  (src/lib/messaging.ts InboxMessage)
-- Firestore subcollection: messageThreads/{id}/messages
-- Named inbox_messages (not messages) to avoid colliding with chat_messages.
-- -----------------------------------------------------------------------------
create table if not exists public.inbox_messages (
  id              text primary key,
  thread_id       text        not null references public.message_threads (id) on delete cascade,
  sender_type     text        not null check (sender_type in ('member','admin','system')),
  sender_name     text        not null default '',
  body            text        not null default '',
  read_by_member  boolean     not null default false,
  read_by_admin   boolean     not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists inbox_messages_thread_created_idx on public.inbox_messages (thread_id, created_at);

-- -----------------------------------------------------------------------------
-- journal_entries  (src/lib/astro-journal.ts JournalEntry)
-- entry_date is a YYYY-MM-DD string; updated_at is an ISO string in the app, so
-- both stay text.
-- -----------------------------------------------------------------------------
create table if not exists public.journal_entries (
  id          text primary key,
  member_id   text        not null references public.members (id) on delete cascade,
  entry_date  text        not null,
  mood        text        not null,
  note        text        not null default '',
  moon_house  integer,
  moon_rashi  text,
  updated_at  text,
  unique (member_id, entry_date)
);

-- -----------------------------------------------------------------------------
-- family_members  (src/lib/family-members.ts FamilyMember)
-- created_at is an ISO string in the app, not a Timestamp.
-- -----------------------------------------------------------------------------
create table if not exists public.family_members (
  id           text primary key,
  member_id    text        not null references public.members (id) on delete cascade,
  name         text        not null,
  relationship text        not null default '',
  birth_date   text,
  birth_time   text,
  birth_place  text,
  created_at   text
);
create index if not exists family_members_member_idx on public.family_members (member_id);

-- -----------------------------------------------------------------------------
-- kundli_matches  (src/lib/kundli-matching.ts KundliMatchRecord)
-- timeline is a TimelineMonth[]; breakdown is an AshtakootBreakdown. Both jsonb.
-- The person_a_* / person_b_* columns come from the write site; the *A / *B
-- suffixed ones come from the declared type — both exist in live documents
-- because the shape evolved. Keep both, or the copy will drop data.
-- -----------------------------------------------------------------------------
create table if not exists public.kundli_matches (
  id                    text primary key,
  member_id             text        references public.members (id) on delete set null,
  name_a                text        not null default '',
  birth_date_a          text,
  birth_time_a          text,
  birth_place_a         text,
  name_b                text        not null default '',
  birth_date_b          text,
  birth_time_b          text,
  birth_place_b         text,
  person_a_name         text,
  person_a_birth_date   text,
  person_a_birth_time   text,
  person_a_birth_place  text,
  person_b_name         text,
  person_b_birth_date   text,
  person_b_birth_time   text,
  person_b_birth_place  text,
  compatibility_score   numeric(6,2),
  moon_a_rashi          text,
  moon_a_nakshatra      text,
  moon_b_rashi          text,
  moon_b_nakshatra      text,
  narrative             text        not null default '',
  breakdown             jsonb,
  timeline              jsonb,
  created_at            timestamptz not null default now()
);
create index if not exists kundli_matches_member_idx on public.kundli_matches (member_id, created_at desc);

-- -----------------------------------------------------------------------------
-- numerology_readings  (INFERRED — src/lib/numerology.ts)
-- Payload shape is not declared as a type; jsonb keeps the copy lossless.
-- -----------------------------------------------------------------------------
create table if not exists public.numerology_readings (
  id         text primary key,
  member_id  text        references public.members (id) on delete set null,
  name       text,
  birth_date text,
  payload    jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists numerology_readings_member_idx on public.numerology_readings (member_id, created_at desc);

-- -----------------------------------------------------------------------------
-- predictions  (src/lib/predictions.ts Prediction)
-- -----------------------------------------------------------------------------
create table if not exists public.predictions (
  id                text primary key,
  member_id         text        not null references public.members (id) on delete cascade,
  member_name       text        not null default '',
  practitioner_id   text        references public.practitioners (id) on delete set null,
  practitioner_name text        not null default '',
  booking_id        text        references public.bookings (id) on delete set null,
  service_title     text        not null default '',
  text              text        not null default '',
  expected_by_date  text,
  status            text        not null default 'pending',
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);
create index if not exists predictions_member_idx on public.predictions (member_id, created_at desc);
create index if not exists predictions_status_idx on public.predictions (status);

-- -----------------------------------------------------------------------------
-- milestones  (src/lib/milestones.ts:14 Milestone)
-- -----------------------------------------------------------------------------
create table if not exists public.milestones (
  id           text primary key,
  member_id    text        not null references public.members (id) on delete cascade,
  type         text        not null default 'bookings',
  value        integer     not null default 0,
  achieved_at  timestamptz not null default now(),
  unique (member_id, type, value)
);

-- -----------------------------------------------------------------------------
-- member_streaks  (src/lib/streaks.ts StreakDoc)
-- Doc id == memberId. badges is a BadgeKey[].
-- -----------------------------------------------------------------------------
create table if not exists public.member_streaks (
  member_id       text primary key references public.members (id) on delete cascade,
  last_active_date text       not null,
  current_streak  integer     not null default 0,
  longest_streak  integer     not null default 0,
  badges          text[]      not null default '{}',
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- audit_logs  (INFERRED — writes across src/app/api/admin/**)
-- before/after hold the changed field snapshots as jsonb; the app only ever
-- appends and lists these, never queries inside them.
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           text primary key,
  admin_id     text,
  admin_name   text        not null default '',
  category     text        not null default 'general',
  entity_type  text,
  entity_id    text,
  action       text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index if not exists audit_logs_admin_idx on public.audit_logs (admin_id, created_at desc);

-- -----------------------------------------------------------------------------
-- gemini_usage  (src/lib/gemini.ts:33-43)
-- Doc id == YYYY-MM-DD (UTC). A daily call-budget counter incremented inside a
-- Firestore transaction; in Postgres use an upsert with an atomic increment.
-- -----------------------------------------------------------------------------
create table if not exists public.gemini_usage (
  day        text primary key,
  count      integer     not null default 0,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- experiments + experiment_variants  (src/lib/experiments.ts:35-42)
-- Firestore: experiments/{key}/variants/{variant} with { impressions, conversions }
-- -----------------------------------------------------------------------------
create table if not exists public.experiments (
  id          text primary key,
  description text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.experiment_variants (
  id           text primary key,
  experiment_key text      not null references public.experiments (id) on delete cascade,
  variant      text        not null,
  impressions  integer     not null default 0,
  conversions  integer     not null default 0,
  updated_at   timestamptz not null default now(),
  unique (experiment_key, variant)
);

-- -----------------------------------------------------------------------------
-- cosmic_profile_cards  (src/lib/cosmic-profile-card.ts CosmicProfileCard)
-- Doc id == memberId. updated_at is an ISO string.
-- -----------------------------------------------------------------------------
create table if not exists public.cosmic_profile_cards (
  member_id    text primary key references public.members (id) on delete cascade,
  name         text        not null default '',
  sun_rashi    text        not null default '',
  moon_rashi   text        not null default '',
  rising_rashi text        not null default '',
  lagna_lord   text        not null default '',
  blurb        text        not null default '',
  updated_at   text
);

-- -----------------------------------------------------------------------------
-- cosmic_weather  (src/lib/astro-journal.ts CosmicWeather)
-- A computed daily snapshot, not user data. active_transits is an object array.
-- -----------------------------------------------------------------------------
create table if not exists public.cosmic_weather (
  id               text primary key,
  day              text,
  moon_house       integer,
  moon_theme       text        not null default '',
  moon_sign_name   text        not null default '',
  active_transits  jsonb       not null default '[]'::jsonb,
  sade_sati_phase  text        check (sade_sati_phase is null or sade_sati_phase in ('rising','peak','setting')),
  rahu_ketu_note   text        not null default '',
  created_at       timestamptz not null default now()
);
create unique index if not exists cosmic_weather_day_key on public.cosmic_weather (day) where day is not null;

-- =============================================================================
-- CUTOVER HELPER — auth_uid_map
--
-- Table ids stay verbatim, so the ONLY thing that must be rewritten at cutover is
-- the set of columns holding a Firebase Auth uid. GoTrue mints its own uuids, so
-- every stored uid needs one pass through this map:
--
--   members.id, admin_users.id, practitioners.firebase_uid,
--   bookings.member_id, wallets.member_id, member_subscriptions.member_id, ...
--
-- The auth migration script (scripts/migrate-auth-users.mjs) populates it as it
-- creates each GoTrue user, then a single UPDATE ... FROM auth_uid_map per column
-- does the remap. Populated during cutover; empty until then.
-- =============================================================================
create table if not exists public.auth_uid_map (
  firebase_uid text primary key,
  supabase_uid uuid        not null unique,
  email        citext,
  mapped_at    timestamptz not null default now()
);
create index if not exists auth_uid_map_email_idx on public.auth_uid_map (email);

do $$
declare t text;
begin
  foreach t in array array[
    'chat_sessions','chat_active_locks','chat_messages','ai_personas','ai_readings',
    'ai_reading_free_claims','notifications','message_threads','inbox_messages',
    'journal_entries','family_members','kundli_matches','numerology_readings',
    'predictions','milestones','member_streaks','audit_logs','gemini_usage',
    'experiments','experiment_variants','cosmic_profile_cards','cosmic_weather',
    'auth_uid_map'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
