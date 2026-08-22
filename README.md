# Adi Jyotish Guru

A premium Vedic astrology platform: a verified practitioner marketplace with instant wallet-metered
chat, scheduled bookings, a suite of deterministic astrology tools (Kundli, matching, Panchang,
numerology, horoscopes, Muhurat Concierge, Varshphal annual reports), AI-assisted readings (palm,
tarot, face, Vastu, Lal Kitab, plus a roster of free-form AI persona chats at `/ai`), and a certified
gemstone store — built on Next.js and Firebase.

[![CI](https://github.com/aman02899999/Adi-Jyotish-saas/actions/workflows/ci.yml/badge.svg)](https://github.com/aman02899999/Adi-Jyotish-saas/actions/workflows/ci.yml)

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript
- **Data:** Firebase (Firestore, Auth, Storage) — no separate database
- **Payments:** Razorpay (one-time checkout, subscriptions, webhooks)
- **Realtime:** Ably (instant chat)
- **AI:** Google Gemini (readings, recommendations, chat)
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
`firebase emulators:start --only auth,firestore` alongside it.

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
see `lighthouserc.js`). `.github/workflows/cron.yml` runs scheduled housekeeping (expiring stale
wallet holds and abandoned gemstone orders) plus a synthetic uptime check against the site's key
routes (`/`, `/pricing`, `/book`, `/astrologers`); `.github/workflows/firestore-deploy.yml` deploys
`firestore.rules`/`firestore.indexes.json` on changes to either file; `.github/workflows/firestore-backup.yml`
runs a daily Firestore export to Cloud Storage.

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
- **Scheduled housekeeping**: `CRON_SECRET`, matching the GitHub Actions repo secret used by
  `.github/workflows/cron.yml`.
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
src/app/          Routes (App Router) — public site, /dashboard, /practitioner, /admin
src/components/    Shared UI
src/lib/           Server-only data/business logic (Firestore access, payments, chat, astrology engines, …)
docs/              Product/architecture background
e2e/               Playwright specs
scripts/           CI/local helper scripts
```

## Documentation

- `docs/astrology-platform-blueprint.md` — product, marketplace, and architecture blueprint.
- `.env.example` — every environment variable, with a comment on what it enables.
