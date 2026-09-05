# Adi Jyotish Guru

A premium Vedic astrology SaaS platform — a verified practitioner marketplace with instant
wallet-metered chat and scheduled bookings, a full membership/subscription business, six AI-powered
reading personas plus admin-authorable AI personas, a suite of deterministic astrology tools, a
certified gemstone store, and a growth/automation layer, all served bilingually (English/Hindi) —
built on Next.js and Firebase.

[![CI](https://github.com/aman02899999/Adi-Jyotish-saas/actions/workflows/ci.yml/badge.svg)](https://github.com/aman02899999/Adi-Jyotish-saas/actions/workflows/ci.yml)

Live at **[astronomers.in](https://astronomers.in)**.

## Features

### Practitioner marketplace & consultations
- Public astrologer directory with categories, ratings, review-based discounted pricing, and a live
  "online now" badge.
- Scheduled bookings with per-practitioner availability rules, plus instant wallet-metered live chat
  (recharge a wallet, chat by the minute, real-time balance via Ably).
- Verified reviews (clarity/empathy/usefulness dimensions), practitioner prediction accountability
  tracking, and a practitioner self-service portal (bookings, earnings, payouts, schedule, chat,
  profile, reviews).

### Membership & payments
- Subscription plans (admin-managed) with automatic session discounts at checkout, plus one-time
  Razorpay checkout for bookings, AI readings, and gemstones.
- Wallet ledger, gift cards (purchase + redemption), a family plan (multi-profile subscription), and
  a referral program with wallet rewards.
- Real PDF invoices with GST calculation, dunning notifications, and Razorpay test/live key
  environments.

### AI-powered readings
Six Gemini-backed reading personas, each a fixed one-time price: **Ask Live** (free-form Q&A),
**Palm Reading**, **Tarot Reading**, **Face Reading**, **Vastu Consultation**, and **Lal Kitab
Reading** — plus an admin-authorable roster of custom AI personas at `/ai/[slug]`. A member's first
Live reading is free. Answer generation is retried automatically (capped, with admin alerting on
permanent failure) and gated by a daily Gemini call budget.

### Deterministic astrology tools (no AI)
Real computed engines, not generated text: full **Kundli** chart reports, **Kundli Matching**
(classical Ashtakoot Guna Milan), daily **Panchang**, **Muhurat Concierge**, **Numerology**, daily
**Horoscopes**, **Varshphal** (annual solar return) reports, a **Cosmic Profile Card** (shareable
chart summary image), a friend compatibility match tool, and an astro journal correlating mood/events
with real transits.

### Gemstone store
Certified gemstone storefront with categories, coupons, reviews, wishlist, cart/checkout, order
tracking, and an AI gemstone recommender.

### Growth & content
Blog, festival micro-experiences (Navratri/Diwali/Karva Chauth muhurat), reading streaks and badges,
milestone social-proof shareable cards, site-wide promo banners, and social share nudges across every
reading/report screen.

### Admin panel
Full back office: services, plans, gemstones (products/categories/coupons/reviews), practitioners,
members, bookings, schedule, reviews, live chat console, billing, wallets, payouts, messages,
AI personas, website content editing, insights, activity/audit log, team & role-based permissions.

### Automation & housekeeping
The recurring 15-minute sweep layer (review-request nudges, lapsed-member win-back, low-stock
alerts, subscription renewal/dunning reminders, gift card expiry, fraud/anomaly flags, a monthly
GST summary, onboarding drip emails, and the rest) has been removed to avoid background Firestore
traffic before the site is actually launched — see `.github/workflows/cron.yml`, which now runs
only a synthetic uptime check against the site's key routes. The two safety-net expiries that
protect real money (stale instant-chat wallet holds, abandoned gemstone pending orders) are
unaffected: they still run inline the moment a member's own request would otherwise hit them, in
`src/lib/chat.ts` and `src/lib/gemstone-orders.ts` respectively — they never depended on the cron.

### Security
Firebase Auth (email/password + Google) across member/practitioner/admin, 2FA (TOTP) on all three
portals, CSRF protection, per-route rate limiting, Cloudflare Turnstile CAPTCHA on anonymous free
tools, encrypted practitioner payout details, and role-based admin permissions.

### Privacy self-service (DPDP/GDPR-style rights)
From **Dashboard → Security** a member can download a complete JSON export of everything stored
about them (profile, birth details, bookings, invoices, readings, wallet ledger, orders, chats —
TOTP secrets and internal flags excluded), and permanently delete their own account: typed
confirmation plus a live 2FA code when enabled, wallet-balance/live-chat/live-subscription
safety gates, hard deletion of everything the member alone owns (including uploaded palm/face
photos in Storage and the Firebase Auth user), and anonymization — not deletion — of the
financial records the business must legally retain (bookings, invoices, gemstone orders, gift
cards). See `src/lib/account-deletion.ts` / `src/lib/account-privacy.ts`.

### Internationalization
English (default, unprefixed URLs) and Hindi (`/hi/...`, Hinglish tone) via next-intl, with a
language switcher and locale-aware SEO (hreflang, sitemap).

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript
- **Data:** Firebase (Firestore, Auth, Storage) — no separate database
- **Payments:** Razorpay (one-time checkout, subscriptions, webhooks)
- **Realtime:** Ably (instant chat)
- **AI:** Google Gemini (readings, recommendations, chat)
- **i18n:** next-intl (English/Hindi)
- **Email:** Resend · **Error tracking:** Sentry · **CAPTCHA:** Cloudflare Turnstile
- **Styling:** a single hand-written `globals.css` (no component CSS framework)
- **Testing:** Vitest (unit) · Playwright (E2E, against the Firebase emulator) · Lighthouse CI (performance/accessibility budget)

## Getting started

Requires Node 22 (see `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # fill in what you need — see below
npm run dev
```

The app only *requires* the Firebase block in `.env.local` to boot (Firestore is the sole database).
Every other integration — Razorpay, Gemini, Ably, Resend, Sentry, Turnstile, analytics — is optional
and gracefully disables itself when its env vars are unset. See `.env.example` for the full list and
what each one unlocks.

### Local development against the Firebase emulator

Playwright and Lighthouse CI both drive the app against the Firestore/Auth emulator instead of a real
Firebase project — see `playwright.config.ts` and `scripts/lighthouse-ci.sh` for the exact env vars.
To do the same for `npm run dev`, set `NEXT_PUBLIC_USE_EMULATOR=true` and start
`firebase emulators:start --only auth,firestore` alongside it. `scripts/seed-firestore-roles.mjs`
seeds demo admin/member/practitioner roles into the emulator for local QA.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run analyze` | Production build with the bundle analyzer (`ANALYZE=true`) |
| `npm run start` | Start the production server (after `build`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E suite (spins up the Firebase emulator + dev server) |

## CI

`.github/workflows/ci.yml` runs three jobs on every push and pull request: `build-and-test`
(typecheck, lint, unit tests, build), `e2e` (the full Playwright suite against the emulator), and
`lighthouse` (a non-blocking performance/accessibility/best-practices/SEO budget via Lighthouse CI —
see `lighthouserc.js`). `.github/workflows/cron.yml` runs a synthetic uptime check against the
site's key routes (`/`, `/pricing`, `/book`, `/astrologers`) — see Automation above for what used
to also run there; `.github/workflows/firestore-deploy.yml` deploys `firestore.rules`/
`firestore.indexes.json` on changes to either file; `.github/workflows/firestore-backup.yml` runs a
daily Firestore export to Cloud Storage.

## Deploying to production

The app deploys to **Vercel**, connected directly to this GitHub repo — every push to `main` deploys
to production (**astronomers.in**), and every pull request gets its own preview deployment. There's no
build/run config file to maintain; environment variables are set in the Vercel dashboard (Project →
Settings → Environment Variables) instead of committed to the repo. At minimum the app needs:

- **Firebase**: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
  `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `FIREBASE_SERVICE_ACCOUNT_KEY`,
  `FIREBASE_STORAGE_BUCKET`.
- **Gemini**: `GEMINI_API_KEY`, `GEMINI_DAILY_CALL_LIMIT`.
- **Razorpay**: `RAZORPAY_MODE=live`, `RAZORPAY_LIVE_KEY_ID`, `RAZORPAY_LIVE_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET` — create the webhook at Settings → Webhooks pointing to
  `https://astronomers.in/api/webhooks/razorpay`.
- **Cloudflare Turnstile**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` — without these the
  app fails closed (403) on registration, kundli-matching, numerology, and gemstone-recommendation.
- **Payouts**: `PAYOUT_ENCRYPTION_KEY` (32-byte, base64).
- **Email**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — verify a sending domain in the Resend dashboard
  before going live; the default is Resend's shared sandbox address.
- **Realtime chat**: `ABLY_API_KEY`.
- **Site URL**: `NEXT_PUBLIC_SITE_URL=https://astronomers.in`.
- **Optional**: Sentry (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT`) and
  the Meta Pixel (`NEXT_PUBLIC_META_PIXEL_ID`) — the app gracefully runs without either.

`.github/workflows/firestore-deploy.yml` deploys `firestore.rules`/`firestore.indexes.json`
automatically on push to `main` — no manual step needed for those.

Every one of these requires access to the live Firebase project, Vercel project, domain registrar,
Razorpay account, and other third-party dashboards — steps only a project owner can complete.

## Project structure

```
src/app/[locale]/   Public site + /dashboard (member), /practitioner, /admin — all locale-routed
src/app/api/        API routes (checkout, webhooks, AI readings, admin actions, cron endpoints, …)
src/components/     Shared UI
src/lib/            Server-only data/business logic (Firestore access, payments, chat, astrology
                     engines, automation, …) — one module per domain, ~90 files
src/i18n/           next-intl routing + message catalogs (en, hi)
docs/               Product/architecture background
e2e/                Playwright specs
scripts/            CI/local helper scripts
```

## Documentation

- `docs/astrology-platform-blueprint.md` — product, marketplace, and architecture blueprint.
- `.env.example` — every environment variable, with a comment on what it enables.
