-- =============================================================================
-- Migration 0002 — Commerce: bookings, invoicing, payments, subscriptions,
--                  wallets, payouts, webhooks
-- Adi Jyotish SaaS — Firebase → Supabase (Postgres)
--
-- Same conventions as 0001 (text PKs holding verbatim Firestore ids, snake_case
-- columns, timestamptz for Timestamps, numeric(14,2) for money, RLS deny-all).
--
-- Sources are cited per table. Where a column is marked INFERRED it was read off
-- a write site rather than a declared type — double-check those against live
-- data with the count queries in 0004 before trusting them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- bookings  (write site: src/app/api/bookings/route.ts:191 tx.set(...))
-- scheduled_at drives slot-conflict detection; the Firestore query
--   where practitionerId == X and status != 'cancelled' and scheduledAt < endsAt
-- becomes the partial index at the bottom of this block.
-- -----------------------------------------------------------------------------
create table if not exists public.bookings (
  id                     text primary key,
  reference              text        not null,
  member_id              text        references public.members (id) on delete set null,
  service_id             text        not null references public.services (id),
  service_title          text        not null,
  service_price          numeric(14,2) not null default 0,
  service_duration       integer     not null default 30,
  practitioner_id        text        not null references public.practitioners (id),
  practitioner_name      text        not null,
  client_name            text        not null,
  client_email           citext      not null,
  client_phone           text,
  birth_date             text,
  birth_time             text,
  birth_place            text,
  scheduled_at           timestamptz not null,
  notes                  text,
  admin_notes            text,
  status                 text        not null default 'pending',
  payment_status         text        not null default 'unpaid',
  kundli_summary         text,
  kundli_generated_at    timestamptz,
  varshphal_summary      text,
  varshphal_year         integer,
  varshphal_generated_at timestamptz,
  paid_at                timestamptz,
  payment_ref            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index if not exists bookings_reference_key on public.bookings (reference);
create index if not exists bookings_practitioner_schedule_idx
  on public.bookings (practitioner_id, scheduled_at)
  where status <> 'cancelled';
create index if not exists bookings_member_idx on public.bookings (member_id, scheduled_at desc);
create index if not exists bookings_payment_status_idx on public.bookings (payment_status);

-- -----------------------------------------------------------------------------
-- invoices  (src/lib/invoice-pdf.ts / src/lib/billing.ts Invoice)
-- -----------------------------------------------------------------------------
create table if not exists public.invoices (
  id            text primary key,
  number        text        not null,
  booking_id    text        references public.bookings (id) on delete set null,
  member_id     text        references public.members (id) on delete set null,
  customer_name text        not null default '',
  customer_email citext     not null default '',
  description   text        not null default '',
  subtotal      numeric(14,2) not null default 0,
  tax_rate      numeric(6,3)  not null default 0,
  tax_amount    numeric(14,2) not null default 0,
  amount        numeric(14,2) not null default 0,
  currency      text        not null default 'INR',
  status        text        not null default 'draft',
  due_at        timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists invoices_number_key on public.invoices (number);
create index if not exists invoices_booking_idx on public.invoices (booking_id);
create index if not exists invoices_member_status_idx on public.invoices (member_id, status);

-- -----------------------------------------------------------------------------
-- payments  (src/lib/billing.ts Payment + write sites in webhook/checkout routes)
-- order_id / payment_status / plan are INFERRED from write sites.
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id                 text primary key,
  invoice_id         text        references public.invoices (id) on delete set null,
  booking_id         text        references public.bookings (id) on delete set null,
  member_id          text        references public.members (id) on delete set null,
  amount             numeric(14,2) not null default 0,
  currency           text        not null default 'INR',
  provider           text        not null default 'razorpay',
  status             text        not null default 'created',
  payment_status     text,
  order_id           text,
  provider_session_id text,
  payment_intent_id  text,
  refund_id          text,
  plan               text,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists payments_member_idx on public.payments (member_id, created_at desc);
create index if not exists payments_booking_idx on public.payments (booking_id);
create unique index if not exists payments_payment_intent_key
  on public.payments (payment_intent_id) where payment_intent_id is not null;

-- -----------------------------------------------------------------------------
-- razorpay_events  (src/app/api/webhooks/razorpay/route.ts:160-162)
-- Document id == the Razorpay event id, which IS the idempotency check: the
-- handler calls .create() and treats already-exists as "deduped". The unique
-- primary key must be preserved for that to keep working.
-- -----------------------------------------------------------------------------
create table if not exists public.razorpay_events (
  id           text primary key,
  type         text        not null,
  processed_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- membership_plans  (src/lib/plans.ts MembershipPlan)
-- `features` is a newline-separated string in the app, NOT an array — do not
-- convert it to text[] or the admin editor breaks.
-- -----------------------------------------------------------------------------
create table if not exists public.membership_plans (
  id                        text primary key,
  key                       text        not null,
  name                      text        not null,
  tagline                   text        not null default '',
  description               text        not null default '',
  price_monthly             numeric(14,2) not null default 0,
  price_yearly              numeric(14,2),
  currency                  text        not null default 'INR',
  features                  text        not null default '',
  session_discount_percent  integer     not null default 0,
  highlighted               boolean     not null default false,
  active                    boolean     not null default true,
  sort_order                integer     not null default 0,
  razorpay_plan_id_monthly  text,
  razorpay_plan_id_yearly   text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create unique index if not exists membership_plans_key_key on public.membership_plans (key);

-- -----------------------------------------------------------------------------
-- member_subscriptions  (src/lib/subscriptions.ts MemberSubscription)
-- Firestore doc id == memberId (one subscription per member). Enforced here.
-- -----------------------------------------------------------------------------
create table if not exists public.member_subscriptions (
  id                     text primary key,
  member_id              text        not null unique references public.members (id) on delete cascade,
  plan_id                text        not null references public.membership_plans (id),
  billing_interval       text        not null default 'monthly' check (billing_interval in ('monthly','yearly')),
  status                 text        not null default 'active',
  razorpay_subscription_id text,
  razorpay_customer_id   text,
  razorpay_payment_id    text,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean     not null default false,
  cancelled_at           timestamptz,
  dunning_notice_sent_at timestamptz,
  renewal_reminder_sent_at timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index if not exists member_subscriptions_razorpay_sub_key
  on public.member_subscriptions (razorpay_subscription_id) where razorpay_subscription_id is not null;
create index if not exists member_subscriptions_period_end_idx
  on public.member_subscriptions (current_period_end) where status = 'active';

-- -----------------------------------------------------------------------------
-- subscription_invoices  (src/lib/subscriptions.ts SubscriptionInvoice)
-- -----------------------------------------------------------------------------
create table if not exists public.subscription_invoices (
  id                  text primary key,
  subscription_id     text        not null references public.member_subscriptions (id) on delete cascade,
  member_id           text        not null references public.members (id) on delete cascade,
  amount              numeric(14,2) not null default 0,
  subtotal            numeric(14,2) not null default 0,
  tax_amount          numeric(14,2) not null default 0,
  tax_rate            numeric(6,3)  not null default 0,
  currency            text        not null default 'INR',
  status              text        not null default 'paid',
  razorpay_payment_id text,
  period_start        timestamptz,
  period_end          timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists subscription_invoices_subscription_idx on public.subscription_invoices (subscription_id, created_at desc);

-- -----------------------------------------------------------------------------
-- payment_failure_counters  (INFERRED — src/lib/payment-bypass.ts / dunning path)
-- Firestore doc id == payment id; `window_start` bounds the rolling counter.
-- -----------------------------------------------------------------------------
create table if not exists public.payment_failure_counters (
  id           text primary key,
  payment_id   text        not null,
  count        integer     not null default 1,
  window_start timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists payment_failure_counters_payment_idx on public.payment_failure_counters (payment_id);

-- -----------------------------------------------------------------------------
-- wallets  (src/lib/wallet.ts Wallet)
-- Firestore doc id == memberId.
-- -----------------------------------------------------------------------------
create table if not exists public.wallets (
  id         text primary key,
  member_id  text        not null unique references public.members (id) on delete cascade,
  currency   text        not null default 'INR',
  balance    numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- wallet_entries  (src/lib/wallet.ts WalletEntry)
-- Firestore subcollection: wallets/{memberId}/entries
-- balance_after makes the ledger self-auditing — the verification queries in
-- 0004 replay it to prove the copy did not drop or reorder a row.
-- -----------------------------------------------------------------------------
create table if not exists public.wallet_entries (
  id                  text primary key,
  wallet_id           text        not null references public.wallets (id) on delete cascade,
  type                text        not null,
  amount              numeric(14,2) not null default 0,
  balance_after       numeric(14,2) not null default 0,
  reference_type      text,
  reference_id        text,
  razorpay_payment_id text,
  created_at          timestamptz not null default now()
);
create index if not exists wallet_entries_wallet_created_idx on public.wallet_entries (wallet_id, created_at);
create index if not exists wallet_entries_reference_idx on public.wallet_entries (reference_type, reference_id);

-- -----------------------------------------------------------------------------
-- wallet_holds  (src/lib/wallet.ts WalletHold)
-- Firestore subcollection: wallets/{memberId}/holds
-- A hold reserves balance for a live chat session and is released on settlement.
-- -----------------------------------------------------------------------------
create table if not exists public.wallet_holds (
  id         text primary key,
  wallet_id  text        not null references public.wallets (id) on delete cascade,
  amount     numeric(14,2) not null default 0,
  status     text        not null default 'active' check (status in ('active','released','captured','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wallet_holds_wallet_status_idx on public.wallet_holds (wallet_id, status);

-- -----------------------------------------------------------------------------
-- gift_cards  (src/lib/gift-cards.ts GiftCard)
-- The Firestore doc id IS the code, so id == code on copy; code stays unique.
-- -----------------------------------------------------------------------------
create table if not exists public.gift_cards (
  id            text primary key,
  code          text        not null,
  buyer_id      text        references public.members (id) on delete set null,
  buyer_name    text        not null default '',
  amount        numeric(14,2) not null default 0,
  currency      text        not null default 'INR',
  recipient_name text       not null default '',
  message       text        not null default '',
  status        text        not null default 'unclaimed' check (status in ('unclaimed','claimed')),
  redeemed_by   text        references public.members (id) on delete set null,
  redeemed_at   timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists gift_cards_code_key on public.gift_cards (code);

-- -----------------------------------------------------------------------------
-- gift_card_payment_index  (INFERRED — src/lib/gift-cards.ts:50)
-- Maps a Razorpay payment id to the gift card it should redeem, so the webhook
-- can complete a purchase without a collection scan.
-- -----------------------------------------------------------------------------
create table if not exists public.gift_card_payment_index (
  id                  text primary key,
  razorpay_payment_id text        not null,
  code                text        not null,
  recipient_name      text,
  message             text,
  redeemed_by         text,
  created_at          timestamptz not null default now()
);
create unique index if not exists gift_card_payment_index_payment_key
  on public.gift_card_payment_index (razorpay_payment_id);

-- -----------------------------------------------------------------------------
-- practitioner_payouts  (src/lib/practitioner-portal.ts:26 PractitionerPayout)
-- -----------------------------------------------------------------------------
create table if not exists public.practitioner_payouts (
  id              text primary key,
  practitioner_id text        not null references public.practitioners (id) on delete cascade,
  amount          numeric(14,2) not null default 0,
  currency        text        not null default 'INR',
  status          text        not null default 'requested',
  payout_method   text        not null default 'upi',
  transaction_ref text,
  notes           text,
  admin_notes     text,
  processed_by    text,
  requested_at    timestamptz not null default now(),
  processed_at    timestamptz,
  updated_at      timestamptz not null default now()
);
create index if not exists practitioner_payouts_practitioner_idx on public.practitioner_payouts (practitioner_id, requested_at desc);
create index if not exists practitioner_payouts_status_idx on public.practitioner_payouts (status);

-- -----------------------------------------------------------------------------
-- referrals  (INFERRED — src/lib/referrals.ts)
-- One row per successful invite; `rewarded` flips when the referee's qualifying
-- action lands. total_earned is a roll-up the app writes back to the referrer.
-- -----------------------------------------------------------------------------
create table if not exists public.referrals (
  id             text primary key,
  member_id      text        not null references public.members (id) on delete cascade,
  referral_code  text        not null,
  referee_id     text        references public.members (id) on delete set null,
  reference_type text,
  reference_id   text,
  amount         numeric(14,2) not null default 0,
  rewarded       boolean     not null default false,
  rewarded_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists referrals_member_idx on public.referrals (member_id, created_at desc);
create index if not exists referrals_code_idx on public.referrals (referral_code);

-- -----------------------------------------------------------------------------
-- practitioner_reviews  (src/lib/marketplace.ts PractitionerReview + read paths
--                        at marketplace.ts:68 and :132-136)
-- The marketplace computes each practitioner's average rating, clarity, empathy
-- and usefulness from the published rows, so those four are NOT NULL numerics —
-- averaging over a nullable column would silently skew the ranking.
-- `source` distinguishes seeded/demo reviews from real ones (admin seed route).
-- -----------------------------------------------------------------------------
create table if not exists public.practitioner_reviews (
  id              text primary key,
  practitioner_id text        not null references public.practitioners (id) on delete cascade,
  member_id       text        references public.members (id) on delete set null,
  booking_id      text        references public.bookings (id) on delete set null,
  session_id      text,
  reviewer_name   text        not null default '',
  rating          smallint    not null check (rating between 1 and 5),
  clarity         smallint    not null check (clarity between 1 and 5),
  empathy         smallint    not null check (empathy between 1 and 5),
  usefulness      smallint    not null check (usefulness between 1 and 5),
  body            text        not null default '',
  status          text        not null default 'pending',
  source          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Exactly the two access patterns in marketplace.ts: the global published feed
-- (status == 'published' order by createdAt desc) and the per-practitioner one.
create index if not exists practitioner_reviews_published_idx
  on public.practitioner_reviews (created_at desc) where status = 'published';
create index if not exists practitioner_reviews_practitioner_idx
  on public.practitioner_reviews (practitioner_id, created_at desc) where status = 'published';
create index if not exists practitioner_reviews_status_idx on public.practitioner_reviews (status);

do $$
declare t text;
begin
  foreach t in array array[
    'bookings','invoices','payments','razorpay_events','membership_plans',
    'member_subscriptions','subscription_invoices','payment_failure_counters',
    'wallets','wallet_entries','wallet_holds','gift_cards',
    'gift_card_payment_index','practitioner_payouts','referrals','practitioner_reviews'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
