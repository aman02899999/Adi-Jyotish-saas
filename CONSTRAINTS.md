# Constraints

The quality bar for this repo. A change that breaks one of these is not done. Numbers marked
"baseline" were measured on 11 Nov 2026 at commit `8b77c0a`; the evidence is in
`docs/REBUILD_STATUS.md`. Change a constraint only in its own PR, with the owner's word.

## Checks that must pass before every push

| Check | Command | Baseline |
|---|---|---|
| Types | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors, 2 warnings (`<img>` in `block-renderer.tsx`) |
| Unit tests | `npm test` | 700 passed, 0 failed |
| Build | `npm run build` | passes |
| Integration (Postgres) | CI job `integration` | not run locally; CI is the proof |
| End to end | `npm run test:e2e` (14 spec files, 21 tests) | not run locally; CI is the proof |

## Ratchets (these only move one way)

1. **Tests are never reduced.** The unit suite stays at 700 passing or more. No test is deleted,
   skipped or weakened to get green. The 694 skipped tests are the Postgres integration suites,
   which skip by design without a database; they must keep running in the CI `integration` job.
2. **No new lint suppressions** (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `as any`)
   and no new lint warnings beyond the 2 at baseline. `src/` holds 17 `eslint-disable` or
   `@ts-` suppressions today; that count may only go down.
3. **No new 1 MB+ file in `public/`.** Four hero videos are over 1 MB today (1.4 to 3.0 MB);
   that list may shrink, never grow.
4. **No new high or critical `npm audit` advisory in production dependencies.** Baseline is
   2 critical and 13 high; it may only go down.
5. **The Supabase cutover allowlist only shrinks** (`src/lib/cutover-coverage.allowlist.ts`).

## Page targets (mobile, throttled, real browser)

Not yet measured: this workspace cannot reach the live site. They become ratchets once Phase 0's
crawl has numbers.

- LCP under 2.5 s, CLS under 0.1, INP under 200 ms.
- 0 axe serious or critical issues (WCAG 2.1 AA).
- 0 console errors, 0 broken links, no sideways scroll at 360, 390, 768 and 1280 px.
- The same in English and Hindi.

## Rules a test should enforce

Each of these is a rule in `CLAUDE.md` §3. Where no test guards it yet, the first change in that
area adds one.

| Rule | Guard today |
|---|---|
| Synthetic reviews never reach a public page or a price | `src/lib/review-provenance.test.ts` |
| Every AI surface says "AI" | `src/lib/honest-disclosure.test.ts` for the six reading pages. PDFs, emails and checkout receipts not yet guarded |
| No struck-out price that was never charged | `src/lib/honest-disclosure.test.ts` |
| "Most chosen" only from real plan counts | `src/lib/honest-disclosure.test.ts` bans the phrase until a count exists |
| No banned claims (guarantees, fear, death or illness predictions) in published text | none |
| Crisis words stop the AI and show helplines | none. No such handling exists |
| Payment bypass flags are off in Production | env-gated in `payment-bypass.ts` and `free-ai.ts`; the Vercel values are unverified |
| Webhooks are signature-checked and idempotent | covered by unit tests; end to end unverified |
| Birth data is never logged or sent to analytics | none |

## Shipping

Every push to `main` deploys to production. Work goes on a branch, into a draft PR, through CI,
and merges only when the owner writes "merge".
