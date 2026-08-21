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

The app deploys to **Firebase App Hosting** — a Next.js-native hosting product that builds and runs
this repo directly, no separate server or container config needed. `apphosting.yaml` is the full
build/run configuration (instance limits, every env var, which ones are secrets); its inline comments
are the authoritative runbook, summarized here:

1. **Firebase Console → Build → App Hosting → Create backend.** Connect this GitHub repo and pick the
   branch to deploy (`main` for production, or a feature branch for a preview backend).
2. **Create every secret** referenced in `apphosting.yaml` (marked `secret:`) before the first deploy —
   the build fails otherwise:
   ```bash
   firebase apphosting:secrets:set SECRET_NAME
   firebase apphosting:secrets:grantaccess SECRET_NAME --backend=<backend-id>
   ```
   Secrets needed: `FIREBASE_SERVICE_ACCOUNT_KEY`, `GEMINI_API_KEY`, `TURNSTILE_SECRET_KEY`,
   `CRON_SECRET`, `RAZORPAY_LIVE_KEY_ID`, `RAZORPAY_LIVE_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
   `PAYOUT_ENCRYPTION_KEY`, `RESEND_API_KEY`, `ABLY_API_KEY`.
3. **Replace the two remaining `REPLACE_ME…` placeholder values** in `apphosting.yaml` with real ones
   before deploying: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Cloudflare Turnstile dashboard) and
   `FIREBASE_STORAGE_BUCKET` (Firebase Console → Storage). `NEXT_PUBLIC_SITE_URL` is already set to
   the production domain, **astronomers.in**.
4. **Connect astronomers.in as a custom domain**: Firebase Console → App Hosting → your backend →
   Custom domains → Add custom domain → enter `astronomers.in` (and `www.astronomers.in` if you want
   both). Firebase generates a TXT record (ownership verification) and the A/CNAME records to point
   the domain at App Hosting — add each one at your domain registrar's DNS panel exactly as shown;
   the values are generated per-project, so there's no fixed record to copy from here. Firebase then
   provisions the TLS certificate automatically once DNS propagates (can take up to 24-48h).
5. **Razorpay webhook**: create it at Settings → Webhooks pointing to
   `https://astronomers.in/api/webhooks/razorpay`, then set `RAZORPAY_WEBHOOK_SECRET` to the secret it
   generates. `RAZORPAY_MODE` is `live` in `apphosting.yaml` — real payments process once deployed.
6. **Resend**: verify a sending domain in the Resend dashboard (`astronomers.in`, or a subdomain like
   `mail.astronomers.in`) and update `RESEND_FROM_EMAIL` accordingly — it currently defaults to
   Resend's shared sandbox address, which will not deliver to arbitrary inboxes.
7. **Optional, currently undeclared**: Sentry (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
   `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT`) and the Meta Pixel (`NEXT_PUBLIC_META_PIXEL_ID`) — the app
   gracefully runs without either; add them to `apphosting.yaml` the same way once wanted.
8. `.github/workflows/firestore-deploy.yml` deploys `firestore.rules`/`firestore.indexes.json`
   automatically on push to `main` — no manual step needed for those.

Every one of these requires access to the live Firebase project, domain registrar, Razorpay account,
and other third-party dashboards — steps only a project owner can complete.

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
