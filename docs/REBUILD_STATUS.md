# Rebuild status

One row per feature: **Works**, **Broken**, **Weak** or **Unknown**, with the evidence.
Baseline taken 11 Nov 2026 at commit `8b77c0a`. Update a row in the PR that changes it.

## What this baseline covers, and what it does not

**Covered:** the code. Every "Certain" below is a command run or a file read on this commit.

**Not covered:** the live site. The workspace that took this baseline is blocked from reaching
`astronomers.in` (the network proxy refused both `www` and the bare domain), so nothing here was
seen in a browser. The crawl at four widths, Core Web Vitals, axe, the GEO audit, the performance
audit and the security audit from Phase 0 are **not done**. Rows that need the live site, a
dashboard or a test payment say Unknown. "Works" below means "the code and its tests are in
place", never "a customer was watched using it".

## Checks run

| Check | Result |
|---|---|
| `npm run typecheck` | Pass, 0 errors |
| `npm run lint` | Pass, 0 errors, 2 warnings (`<img>` in `src/components/block-renderer.tsx`) |
| `npm test` | Pass. 58 files and 677 tests passed; 68 files and 694 tests skipped (Postgres integration suites, which skip without a database) |
| `npm run build` | Pass. 306 routes. Built without Firebase credentials, so pages fell back to defaults |
| Integration suite on Postgres | Not run here. CI job `integration` |
| Playwright e2e (14 files, 21 tests) | Not run here. CI job `e2e` |
| `npm audit --omit=dev` | 29 advisories: 2 critical (`next`, `@sentry/nextjs`), 13 high (including `firebase`, `sharp`, `axios`), 13 moderate, 1 low |
| Secrets committed to the repo | None found by pattern scan (the one hit is a dummy key in a test) |
| Repo visibility | Public, which the AGPL licence of Swiss Ephemeris requires |

## Trust and compliance

| Feature | Status | Evidence |
|---|---|---|
| AI label on the six AI reading pages | **Works** in code, live unverified | Each page now shows an "AI reading · Not a person" badge on the persona card, an AI notice beside the form that takes payment, and "AI" in its title. Guarded by `src/lib/honest-disclosure.test.ts`. Seen in a local browser at 390 and 1280 px. The reading PDFs and emails are not yet checked |
| AI label on the 30 AI chat astrologers | **Unknown** | The home page copy says "each one labelled" (`messages/en.json`). Cards and profiles not viewed in a browser |
| Struck-out prices on AI chat cards | **Works** in code, live unverified | The invented anchor (`computeSessionPriceAnchor`) is removed; cards, profiles and the home page show the flat session price only. Guarded by the same test |
| Struck-out price on Palm Reading | **Works** in code, live unverified | The ₹999 anchor and "% OFF" badge are removed; the page shows ₹349 |
| Discount on the two human astrologers | **Works**, review it | `reviewDiscountPercent`: 30% off with no reviews, 20% under 10, 10% under 25. A real new-astrologer discount off the listed rate, and the same number is billed. Whether the listed rate was ever charged is the owner's to confirm |
| "Most chosen" on Pro | **Works** in code, live unverified | The badge now reads "Our pick", which is what the admin's highlight switch means. The unsourced "pays for itself by the second session" line is gone. A count-backed "Most chosen" can return once plan numbers exist |
| Home page counts (consultations, reviews, rating) | **Works** | `getHomepageStats` counts completed bookings and genuine reviews, excluding demo accounts |
| Synthetic reviews kept off public pages | **Works** | `src/lib/review-provenance.ts` and its tests. The seeded rows are still stored |
| One brand | **Broken** | "Adi Jyotish" appears in 53 source files; the package is `jyotish-studio`; the domain is astronomers.in. The word "Astronomers" appears in no page |
| Support email on the domain | **Broken** | Default is `support@adijyotishguru.com` (`src/lib/studio-settings-defaults.ts`), a fourth domain. Seeded astrologer emails use `@jyotish.studio`. The admin can override the support address; the live value is unknown |
| Bare domain redirect | **Unknown** | Could not reach the site from here. The brief reports a 404 on `https://astronomers.in` |
| Crisis-word handling in AI chat and readings | **Broken** | No match for suicide, self-harm, helpline or crisis anywhere in `src/` |
| Minors rule | **Weak** | Mentioned only in the terms, privacy and refund pages. No age check in code |
| Footer disclaimer | **Works** | `Footer.disclaimer` in `messages/en.json`, plus a legal note on each reading page |
| AGPL source link in the footer | **Broken** | No link to the source in `site-footer.tsx` |
| Privacy page matches what is collected | **Unknown** | Not reviewed yet |

## Money paths

All Unknown end to end: none was exercised with a test payment in this baseline.

| Feature | Status | Evidence |
|---|---|---|
| Wallet recharge, per-minute chat, hold release | **Unknown** | Unit tests pass. Not run end to end |
| Booking, payment, confirmation email | **Unknown** | Same |
| Plan subscribe, renew, cancel, dunning | **Unknown** | Same. The dunning sweep was removed with the other sweeps |
| AI reading: pay, answer, refund on failure | **Unknown** | Same |
| Gift cards, family plan, referrals, GST invoice | **Unknown** | Same |
| Razorpay webhook: signature and duplicates | **Unknown** | Unit-tested. Live webhook configuration not seen |
| Payment bypass flags | **Unknown** | Off unless the variable is exactly `true` (`payment-bypass.ts`, `free-ai.ts`). The Production values in Vercel were not checked |
| Daily reconciliation against Razorpay | **Broken** | Does not exist |
| Revenue, members, traffic | **Unknown** | No access to Razorpay, Firebase or Search Console |

## Product

| Feature | Status | Evidence |
|---|---|---|
| Free tools (kundli, matching, panchang, muhurat, numerology, horoscope, varshphal, cosmic profile) | **Unknown** | Routes build and engine unit tests pass. Results not compared against a second engine |
| Astrologer marketplace and profiles | **Unknown** | Builds. Recent commits (#28 to #32) fixed Firestore quota exhaustion on this list, so treat it as fragile |
| Member, practitioner and admin portals | **Unknown** | Build. Not clicked through |
| Gemstone store | **Weak** | "Coming soon". No certified supplier or return terms |
| Hindi site | **Broken** | Only the home page, the nav, the footer and the language switcher read translated strings (5 files use the translation hook; `messages/hi.json` holds 162 strings). The other 100 or so pages have their copy written inline in English, so `/hi/...` shows English on them. The AI readings themselves are written in Hinglish by the prompt |
| Blog and festival pages | **Weak** | 6 short posts and 3 festival pages, all 2026 (per the brief; not recounted) |

## SEO and AI search

| Feature | Status | Evidence |
|---|---|---|
| Hreflang | **Unknown** | No `alternates.languages` in any page metadata, although the README says hreflang exists. The locale middleware may send it as a header; needs the live response |
| Hindi URLs in the sitemap | **Broken** | `src/app/sitemap.ts` builds English URLs only |
| `llms.txt` | **Broken** | No such file or route |
| Thin AI astrologer profiles | **Weak** | 30 near-duplicate profile pages (per the brief) |
| Structured data | **Unknown** | Not reviewed |

## Speed

| Feature | Status | Evidence |
|---|---|---|
| Core Web Vitals | **Unknown** | Not measured. The brief reports `/book` at about 7.6 s |
| Media weight | **Weak** | Four hero videos in `public/videos` between 1.4 and 3.0 MB; `public/` is 15 MB |
| Cache windows | **Weak** | Nine pages revalidate every hour (`revalidate = 3600`); the brief's target is 6 hours or more to save Firestore reads |

## Security and privacy

| Feature | Status | Evidence |
|---|---|---|
| Dependencies | **Weak** | 2 critical and 13 high advisories in production dependencies. `next` and `@sentry/nextjs` have fixes available |
| 2FA, CSRF, rate limits, Turnstile | **Unknown** | Present in code with unit tests. No audit run |
| Firestore rules | **Unknown** | `firestore.rules` is 401 bytes; not reviewed |
| DPDP export and delete | **Unknown** | Code and tests exist (`account-privacy.ts`, `account-deletion.ts`). Not exercised |
| Full security audit | **Not done** | Phase 7 |

## Operations

| Feature | Status | Evidence |
|---|---|---|
| Uptime check | **Weak** | `.github/workflows/cron.yml` is manual-only (`workflow_dispatch`). Nothing checks the site on a schedule, so the "hourly uptime check" in `CLAUDE.md` does not exist |
| Firestore backup | **Unknown** | Scheduled daily at 03:00 UTC. Recent runs not checked |
| Automations (emails, sweeps) | **Broken by choice** | Removed before launch (README). None running |
| Supabase cutover | **Dormant** | Built and tested behind `SUPABASE_CUTOVER`. Copy scripts never run on live data |
| Hosting plan | **Unknown** | Vercel plan not checked |
| Toolkit | **Works** | Copied in this PR; lint and typecheck still pass with it in the tree |

## Corrections to `CLAUDE.md` found while taking this baseline

1. The AI label is missing on all six reading pages, not only `/ask`.
2. The support email in code is `support@adijyotishguru.com`, not `support@jyotish.studio`.
3. The uptime check is manual, not hourly.
4. The struck-out AI prices are confirmed invented, so "keep only if real" resolves to "remove".
5. "Hindi at `/hi/...`" overstates it: only the home page and the site chrome are translated.

## Still to do in Phase 0

- Crawl every sitemap URL at 360, 390, 768 and 1280 px in English and Hindi, from a machine that
  can reach the site (or against a preview build with the emulator).
- Run `geo-audit`, `web-performance-auditor` and `security-auditor`.
- Read the CI results of this PR for the integration and e2e suites.
