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
