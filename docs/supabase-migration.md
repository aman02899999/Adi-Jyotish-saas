# Firebase → Supabase migration runbook

Target Supabase project: `qgaklmvkvyljqivvryfs` (Postgres + Auth + Storage).

## What this document covers, and what it does not

**In the repo today** — the database side of the migration:

| Path | What it is | Verified how |
|---|---|---|
| `supabase/migrations/0001_identity_rbac_scheduling.sql` | members, admins, RBAC, practitioners, scheduling, services | applied clean on PostgreSQL 18.4 |
| `supabase/migrations/0002_commerce.sql` | bookings, invoices, payments, plans, subscriptions, wallets, payouts, reviews | applied clean |
| `supabase/migrations/0003_gemstones_content.sql` | gemstone store, CMS, site content, horoscopes | applied clean |
| `supabase/migrations/0004_engagement_audit_cutover.sql` | chat, AI readings, messaging, engagement, audit, `auth_uid_map` | applied clean |
| `supabase/migrations/0005_gemstone_order_refund_claim.sql` | `gemstone_orders.refund_claimed_at`; relaxes two coupon-usage columns Firestore never populated | applied clean |
| `supabase/migrations/0010_write_site_columns.sql` | seven columns the documents carry but the type-derived schema did not: `admin_users.active` (the sign-in gate), `token_hash` on both invite tables, `referrals.referrer_id`/`code`/`status`, `cosmic_weather.houses`/`updated_at`; also drops two NOT NULLs on `referrals` that no code path ever writes | applied clean, twice |
| `supabase/migrations/0011_align_erasure_with_retention_policy.sql` | realigns six `members` foreign keys that inverted the account-deletion policy | applied clean; erasure behaviour verified row-by-row before and after |
| `supabase/migrations/0013_studio_milestones.sql` | makes `milestones.member_id` nullable: milestones are studio-wide ("500 consultations delivered"), so the per-member NOT NULL made every Firestore milestone uncopyable and unwritable | applied clean, twice; `engagement-supabase.integration.test.ts` fails without it |
| `scripts/migrate-firestore-to-supabase.mjs` | copies all 62 collections into those tables | syntax-checked; **not** run against live data |
| `scripts/migrate-auth-users.mjs` | Firebase Auth → GoTrue, passwords preserved | syntax-checked; **not** run against live data |
| `scripts/rewrite-auth-uids.sql` | the one id remap | executed end-to-end on a seeded database; 20 column assertions passed |
| `src/lib/supabase-config.ts` | the `isSupabaseConfigured()` / `isSupabaseCutoverActive()` gate | 24 unit tests |
| `src/lib/postgres-mapping.ts` | camelCase ↔ snake_case mapping, numeric coercion, upsert builder | 124 unit tests over a 51-name fixture of the tricky cases; `postgres.integration.test.ts` round-trips all 356 schema column names read from `information_schema` |
| `src/lib/postgres.ts` | server-side pooled client, transactions, error classifiers | 8 integration tests against a live PostgreSQL 18.4 running the migration schema |
| `src/lib/auth-verify.ts` | verifies either provider's token server-side, behind one call | 26 unit tests; mutation-checked |
| `src/lib/auth-client.ts` + `src/lib/supabase-client.ts` | browser sign-in, provider chosen by `NEXT_PUBLIC_SUPABASE_AUTH` | type-checked; **not** exercised against a live project |
| `src/lib/supabase-storage.ts` | Storage twin for the reading photos | 13 unit tests on the path/URL helpers |
| `scripts/migrate-storage-to-supabase.mjs` | copies the Firebase Storage bucket | helpers unit-tested; **not** run against live data |

Applying all eleven migrations to an empty PostgreSQL 18.4 database yields **66 tables, 359 distinct column names, 159 indexes, 60 foreign keys, RLS enabled on all 66**, and re-applies idempotently.

**Deriving columns from the types gives you the shape you expect, not the shape you have.** Migration 0010 exists because seven columns were only ever reached through an untyped cast (`where("active", "==", true)`) or a shorthand property (`{ referrerId, refereeId }`), so no type mentions them. `admin_users.active` is the sign-in gate — `admin-auth.ts` returns null for an admin whose document has it falsy — so a cutover without that column would have locked every admin out with no error anywhere. The audit that found them is reproducible: parse every `set`/`update`/`create` payload and every `where`/`orderBy` field, map each collection to its table with the copy script's own table, and report keys that match none of that table's columns.

RLS is deny-all **by omission**: `pg_policies` has zero rows on all 66 tables.
Enabling row level security with no policy means every role that lacks `BYPASSRLS` sees zero rows,
which is the safest default for a schema nothing public should ever read. Two
consequences worth knowing: `select count(*) from pg_policies` returning 0 is the
expected result, not a failed migration; and RLS does not constrain the
`SUPABASE_DB_URL` connection, because that role owns the tables and owners bypass
RLS unless `force row level security` is set. RLS here protects the
`anon`/`authenticated` PostgREST path, not the server's direct one.

The gate is split in two on purpose. `isSupabaseConfigured()` answers "are the credentials valid" and `isSupabaseCutoverActive()` answers "should traffic be routed here" — the latter also requires `SUPABASE_CUTOVER=true`. That means credentials can be added to a deployment days before the cutover without changing a single code path, and the actual switch is one variable. Ported read/write sites branch on `isSupabaseCutoverActive()`.

**Still open, and required before cutover.** This is the honest gap:

1. **Most read/write sites are not ported yet.** The exact list is `src/lib/cutover-coverage.allowlist.ts`: every route or page, and every exported library function, that touches Firestore without consulting `isSupabaseCutoverActive()`. `cutover-coverage.test.ts` recomputes it on every CI run and fails on anything new that is not listed, and on anything listed that has since been ported, so the list can only shrink. Phase 4 cannot start until each entry is ported or carries a reason to stay. When it was introduced it held 48 entries; the counts in the rest of this paragraph predate it. 118 files across `src/` import `@/lib/firestore`. Nineteen of them now branch on the gate — `plans.ts`, `studio-settings.ts`, `wallet.ts`, `chat.ts`, `subscriptions.ts`, `scheduling.ts`, `predictions.ts`, `marketplace.ts`, `practitioner-portal.ts`, `gemstones.ts`, `gemstone-orders.ts`, `gemstone-coupons.ts`, `booking-creation.ts`, `billing.ts`, `invoice-actions.ts`, `notifications.ts`, `session-cookie.ts`, `ai-readings.ts` and `account-deletion.ts` — backed by sixteen `<module>-supabase.ts` twins holding the SQL, each with an integration test that runs against a real Postgres. In `gemstones.ts` that covers every storefront read (catalog with all six sorts and every filter, product-by-slug, related, by-ids, by-slugs, active slugs, categories) and the admin CRUD (`gemstones-admin-supabase.ts`: categories, products, variants, images, `duplicateProduct`), so the store is read-write at cutover, not read-only. In `gemstone-orders.ts` and `gemstone-coupons.ts` that covers the whole checkout: cart pricing, pending-order creation with its stock and coupon reservation, payment capture, the refund claim, status transitions with stock release, the stale-order sweep, and every order/coupon read. In `practitioner-portal.ts` that now covers the whole portal: the payout money path (`requestPayout`, `updatePayoutStatus`, the admin and own payout reads), the earnings stats, the booking and review lists, the schedule read and its transactional replace, the profile and online toggles, the encrypted payout details, the duplicate-bank-account scan, and all eight Kundli/Varshphal report entry points. In `scheduling.ts` that covers `getPractitionerDirectory` and the booking conflict check (`getAvailableSlots`, and therefore `validateAvailableSlot`). Booking *creation* now lives in `booking-creation.ts`, which was extracted from `api/bookings/route.ts` because a transaction cannot be tested from a route handler; the route keeps validation, discounting and notifications. In `billing.ts` that covers invoice creation, the backfill and both billing reads. The invoice *actions* — marking paid, voiding, refunding, confirming a Razorpay payment — were inline in `api/invoices/[id]`, `api/member/invoices/[id]/checkout` and `api/member/invoices/[id]/verify`; they now live in `invoice-actions.ts` and all three routes are Firestore-free, so invoicing is end to end. The rest still query Firestore unconditionally, so flipping `SUPABASE_CUTOVER` today would move plans, studio settings, wallets, chat, subscriptions, the practitioner directory and slot availability, and leave everything else — journal, notifications, CMS, payouts — reading a database nobody writes to. Porting a module means branching on the gate and translating its Firestore queries to SQL; `wallet.ts` is the worked example for anything that handles money and `chat.ts` for anything that takes a lock.

   **Porting a module is not the same as porting its call graph.** `chat.ts` calls out to two modules that were unported when it was gated, and gating a module only helps if everything it reaches is gated too. Both are now closed: `getMemberDiscountPercent` via `subscriptions-supabase.ts`, and `getMarketplacePractitioners` via `practitioners-supabase.ts`, which also covers `getPractitionerDirectory` (`scheduling.ts`) and `getPractitionerAccuracyMap` (`predictions.ts`). `startChatSession` under cutover no longer needs Firestore. Before flipping the flag, walk the import graph from every ported module and check what it still reaches; the safest order is bottom-up, leaves first.

   Two traps found while porting the directory, both of which fail silently:

   - **`practitioners.has_portal_access` must be computed, not read.** `practitionerFromDoc()` has always derived it as `Boolean(firebaseUid)`, and Firestore documents carry no such field — so the copied column is `false` for every practitioner. Reading it would revoke portal access from every practitioner at cutover, with no error anywhere. `practitioners-supabase.integration.test.ts` plants contradicting values in the column to prove the mapper ignores it.
   - **`count()` comes back as a string.** node-postgres returns `int8` as text, so `resolved < MIN_RESOLVED_FOR_PUBLIC_STAT` compares a string, is always false, and every practitioner's accuracy stat gets published regardless of sample size. The SQL casts to `::int` and the test asserts `typeof … === "number"`.

   **`account-deletion.ts` is the one port that leans on the schema rather than repeating it.** The Firestore version enumerates by hand every collection a member owns, because Firestore has no referential integrity; migration 0011 aligned all 29 `members` foreign keys with that same policy, so the Postgres path scrubs the retained rows and then issues a single `delete from members`. Re-enumerating the owned tables in SQL would have created a second copy of the policy that could drift from the constraints. Three things the cascade does not reach, and which cost a bug each to find: `notifications.recipient_id` is polymorphic across members and practitioners so it carries no foreign key at all; `cancelSubscriptionIfAny` read Firestore unconditionally and would have left Razorpay billing a deleted account; and the reading photos and the identity record both change provider at cutover — see step 9 of phase 4, which exists because the first version of that helper deleted from Firebase on both paths and silently no-opped.

   `applyDiscount` is pure but still lives in the Firestore-importing `subscriptions.ts`, so chat pulls that module in for it alone; extracting it to a leaf module is the cheap next step.

2. **Session cookies (now closed).** `admin-auth.ts`, `member-auth.ts` and
   `practitioner-auth.ts` managed a long-lived signed HTTP cookie through
   Firebase's `createSessionCookie`, `verifySessionCookie` and
   `revokeRefreshTokens`, and three more call sites revoked by uid. GoTrue has no
   equivalent — its browser sessions are a localStorage token, not a cookie, and
   there is no admin-reachable "invalidate everything issued before T". So this
   was a design change, not a translation, and it is described under
   "Session cookies" below. All eight sites now route through one module.

## Session cookies

Firebase signs the app's session cookies and revokes them centrally:
`verifySessionCookie(cookie, true)` rejects any cookie issued before the user's
`tokensValidAfterTime`, and `revokeRefreshTokens(uid)` moves that timestamp to
"now". GoTrue offers neither, so the app signs its own.

**The cookie.** `src/lib/app-session.ts` mints
`asv1.<base64url({sub,iat,exp,emailVerified})>.<base64url(HMAC-SHA256)>`. There is
no algorithm field, so the `alg: none` and RS256→HS256 substitution attacks have
nothing to substitute — the only verification path is HMAC-SHA256 with one key.
The signature is compared with `timingSafeEqual`, guarded by a length check first
because `timingSafeEqual` throws on mismatched lengths rather than returning false.

**The key** is HKDF-derived from `SUPABASE_JWT_SECRET` with its own info string,
which domain-separates it from the key `auth-verify.ts` uses for GoTrue access
tokens without adding a tenth required secret. Reusing that secret is not a new
exposure: anyone holding it can already mint an access token this app accepts.
Two consequences to know: rotating `SUPABASE_JWT_SECRET` logs everyone out, and a
missing or short secret throws rather than falling back to a default, because a
predictable signing key turns every cookie into a forgery.

**`emailVerified` is in the payload** because Firebase's session cookie carries
the whole ID-token claim set and `member-auth.ts` reads that one claim to decide
whether to prompt for verification. Dropping it would have nagged every
Supabase-backed member on every page load.

**Revocation** is `auth_session_revocations` (migration 0007): one row per user
holding the instant before which their cookies are dead. `iat` is whole seconds,
so the comparison floors the marker — a cookie issued in the same second as a
revocation is accepted. That sub-second leniency deliberately favours not locking
out a user who has just re-authenticated. `user_id` is not a foreign key, because
the admin "remove from team" path revokes *after* deleting the account. The
upsert uses `greatest()` so a second revocation can never move the marker
backwards and un-revoke what the first one killed.

**What it does not do:** revoke the user's GoTrue browser session. The client
signs that out through `@/lib/auth-client`. Server-rendered pages are gated by the
app cookie.

All three Firebase session-cookie calls now live in `src/lib/session-cookie.ts`
and nowhere else. `grep -rn 'getAuth()\.\(createSessionCookie\|verifySessionCookie\|revokeRefreshTokens\)' src/`
should return exactly three lines, all in that file — if it returns more, someone
has added an ungated call site.

Phases 1–3 below are safe rehearsal: they populate a database nothing reads yet. **Phase 4 must not be run until items 1–3 are done**, or the deploy comes up pointing at a database nothing can read.

## What item 2 and item 3 of that gap now look like

Both were written in this pass. Neither has been exercised against the live
Supabase project, because this environment cannot reach it — that verification is
still yours to run.

**Storage (was item 2).** `src/lib/supabase-storage.ts` is the twin, and
`src/lib/ai-readings.ts` branches on the gate at its four upload/download sites.
`scripts/migrate-storage-to-supabase.mjs` copies the bucket; paths are stored
verbatim in `ai_readings` documents so nothing rewrites them, and the destination
bucket defaults to `readings` (`SUPABASE_STORAGE_BUCKET` overrides). The script
and the runtime client each build object URLs, and `supabase-storage-path.test.ts`
asserts they agree on seven path shapes — a divergence there is a silent 404 on
the next reading rather than an error at copy time. That test was confirmed to
fail when the script's normaliser is deliberately broken.

**Browser auth (was item 3).** Components import `@/lib/auth-client`, which picks
a provider from `NEXT_PUBLIC_SUPABASE_AUTH` and dynamically imports only that
SDK, so both are never shipped together. `src/lib/supabase-client.ts` mirrors the
eight exports of `firebase-client.ts`. Three behaviour differences are inherent to
the provider, not bugs:

- Google sign-in is **redirect-only**. `signInWithGoogle()` always returns `null`
  and `completeGoogleRedirectSignIn()` reads the session that the redirect left
  behind. Firebase's popup flow has no Supabase equivalent.
- Password reset is a **single-use `?code=` exchange**, not a reusable oob code.
  `verifyPasswordResetCode(code)` exchanges it and returns the email address;
  `confirmPasswordReset` then sets the password on the session that exchange
  created. Note it returns a bare **string**, matching Firebase's signature —
  `reset-password-form.tsx` pipes it straight into state.
- `createUserWithEmailAndPassword` **throws** if the project has "Confirm email"
  enabled, because no session comes back to hand to the caller. Turn that setting
  off, or add an explicit email-confirmation step.

**Server-side verification.** Every one of the 12 `verifyIdToken` call sites now
calls `verifyAuthToken` from `src/lib/auth-verify.ts`, which picks the verifier
from the token itself. The only `verifyIdToken` left in production code is the
Firebase branch inside that module. It requires `SUPABASE_JWT_SECRET` and
verifies HS256 by hand with `node:crypto` — `jose` cannot be added as a direct
dependency, because Next.js already pins it and npm rejects the override
(`EOVERRIDE`). Two provider differences matter: Supabase stamps the sign-in
provider as `google` where Firebase uses `google.com`, so use
`signInProviderIsGoogle()` rather than comparing strings (`practitioner-google-login`
depends on it), and the display name lives in `user_metadata.full_name` rather
than a top-level `name` claim.

## Design decisions worth knowing before you touch this

**Table ids are `text` and hold the Firestore document id verbatim.** That is what lets the copy script be a straight serialisation with no id translation. The one exception is auth, below.

**Auth ids are the single remap.** `auth.users.id` is a uuid; a Firebase uid is a 28-char opaque string. `scripts/migrate-auth-users.mjs` mints a new uuid per user and records the pair in `public.auth_uid_map`; `scripts/rewrite-auth-uids.sql` then rewrites every uid-bearing column in one transaction.

**Passwords survive without a reset.** GoTrue implements the `$fbscrypt$` prefix (`supabase/auth` `internal/crypto/password.go`), so Firebase's modified-scrypt hashes are carried across verbatim. The modular string built by the auth script is:

```
$fbscrypt$v=1,n=<rounds>,r=<memCost>,p=1,ss=<base64SaltSeparator>,sk=<base64SignerKey>$<salt_b64>$<hash_b64>
```

Note the name inversion: Firebase's `rounds` is log2(N), which is GoTrue's `n`; Firebase's `memCost` is scrypt's block size, which is GoTrue's `r`. `p` is always 1. All base64 sections are standard encoding *with padding* — GoTrue uses `base64.StdEncoding`, so stripping padding breaks verification.

**Three tables enforce concurrency by row existence**, not by a status column:

- `chat_active_locks` — doc id is the member id; Firestore's create-fails-if-exists *is* the lock (`src/lib/chat.ts:168`)
- `razorpay_events` — doc id is the Razorpay event id, used as the webhook idempotency check (`src/app/api/webhooks/razorpay/route.ts:160`)
- `gemstone_coupon_customer_usage` — doc id is `${couponCode}_${identifier}`, enforcing the per-customer coupon limit (`src/lib/gemstone-orders.ts:38`)

Postgres gives the same guarantee through the primary key, but the code must catch `unique_violation` (`23505`) instead of Firestore's already-exists error. **This is a required code change at cutover.** Use `isUniqueViolation()` from `src/lib/postgres.ts` rather than comparing SQLSTATE by hand at each call site.

**Columns that look like arrays but must stay `text`**: `practitioners.specialties`, `practitioners.languages`, `practitioners.consultation_modes`, `membership_plans.features`, `gemstone_recommendations.category_slugs`, `gemstone_reviews.image_urls`. The app joins these into a single delimited string; converting to `text[]` breaks the admin editors.

**String dates stay `text`**: `birth_date`, `birth_time`, `journal_entries.entry_date`, `daily_horoscopes.date`, `studio_settings.updated_at`, `promo_banner.updated_at`. The app parses or formats them itself, and the last two are deliberately ISO strings because of an `unstable_cache` serialisation round-trip (`src/lib/studio-settings.ts:16`).

## Prerequisites

- Supabase project `qgaklmvkvyljqivvryfs` created, with the Postgres password and `service_role` key available.
- `SUPABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY` set locally. **Never paste keys into chat or commit them.**
- `SUPABASE_JWT_SECRET` set server-side (the project's JWT secret, **Settings → API Keys** → JWT Secret). Required by `auth-verify.ts` to accept Supabase-issued tokens. Never in a `NEXT_PUBLIC_` variable.
- `NEXT_PUBLIC_SUPABASE_AUTH=supabase` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the browser client. Without the first, `auth-client.ts` keeps using the Firebase SDK — that is the switch, and it is separate from `SUPABASE_CUTOVER`.
- `SUPABASE_STORAGE_BUCKET` if the reading images should not go to the default `readings` bucket.
- `SUPABASE_CA_CERT` — Supabase's CA bundle, PEM with newlines escaped as `\n` (**Settings → Database → SSL configuration → Download certificate**). The pool verifies the certificate chain; the previous `rejectUnauthorized: false` accepted any certificate at all, which meant the connection password could be handed to whoever answered. Without this variable the pool falls back to Node's default trust store, which may not carry Supabase's issuer — **the connection then fails rather than silently downgrading**, which is deliberate. Set it before phase 4, not during.
- `SUPABASE_CUTOVER` left unset or `false` until phase 4.
- `FIREBASE_SERVICE_ACCOUNT_KEY` set — the same service account the app already uses.
- `npm install` run (`pg` is a devDependency, used only by these scripts).

### Where each value comes from

In the Supabase dashboard, open project `qgaklmvkvyljqivvryfs`. Every settings URL
accepts `_` in place of the project ref and redirects to your most recent project:

| Variable | Dashboard location | Notes |
|---|---|---|
| `SUPABASE_URL` | **Settings → API Keys**, "Project URL" | `https://qgaklmvkvyljqivvryfs.supabase.co` — also derivable from the ref alone |
| `SUPABASE_DB_URL` | **Settings → Database**, "Connection string" | Fill in the database password. Use the direct (port 5432) host, not the pooler, for migrations |
| `SUPABASE_SERVICE_ROLE_KEY` | **Settings → API Keys** | See the key-format note below |

**Key format matters.** Supabase is deprecating the legacy `anon`/`service_role`
JWTs by the end of 2026 in favour of publishable/secret keys:

- **Legacy project** — the *Legacy API keys* tab shows `service_role`, a JWT
  beginning `eyJ…`.
- **New project** — the *Publishable and secret API keys* tab shows a secret key
  beginning `sb_secret_…`. If you only see a **Create new API keys** button, the
  project is still legacy-only; creating them is safe and adds the new keys
  alongside the working legacy ones.

Either works with `scripts/migrate-auth-users.mjs`, which sends the key on the
`apikey` header and only adds `Authorization: Bearer` when the value is actually a
JWT — a secret key is not a JWT and is rejected in that header. Prefer a secret
key for new work.

This key bypasses row-level security on every table in the schema. It belongs in
the platform's secret store (App Hosting / Vercel env vars) and in a local
`.env.local` that is gitignored — never in the repository, never in a
`NEXT_PUBLIC_`-prefixed variable, and never pasted into chat.


## Phase 1 — provision

1. Create the Supabase project and note the ref.
2. Disable "Pause project" auto-suspend for the migration window.
3. Copy the connection string into `SUPABASE_DB_URL`.

## Phase 2 — apply the schema

Run the four migrations in numeric order, in the Supabase SQL editor or via `psql`:

```bash
for f in supabase/migrations/000*.sql; do
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f" || break
done
```

Expected result: 65 tables, RLS on all of them. Confirm:

```sql
select count(*) from information_schema.tables where table_schema = 'public';  -- 65
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relrowsecurity;                              -- 65
```

## Phase 3 — rehearsal copy

Safe to run repeatedly; every write is an upsert on the primary key.

```bash
# Read-only pass: counts what would move, writes nothing
node scripts/migrate-firestore-to-supabase.mjs --dry-run

# Real pass, plus a Firestore-vs-Postgres count comparison
node scripts/migrate-firestore-to-supabase.mjs --verify

# A single collection, when debugging one shape
node scripts/migrate-firestore-to-supabase.mjs --only=bookings --verify
```

### Two ways the copy used to die mid-run

Both were found by `src/lib/firestore-copy.integration.test.ts`, which imports the
script's real functions and runs them against a live database. Both would have
surfaced during the cutover itself, with writes frozen and a half-copied
database.

**A document field with no column aborted the whole collection.** The schema was
derived from the TypeScript types, but Firestore is schemaless: production
documents carry fields the types never declared — an abandoned feature, an old
spelling, something written by hand once. The insert built its column list from
the documents themselves, so one stray field produced:

```
error 42703: column "abandoned_experiment_flag" of relation "members" does not exist
```

and killed the batch. The script now checks each table's real columns against
`information_schema`, drops anything unmapped, and prints what it dropped — both
inline and in a summary at the end. **Read that summary before cutover.** A field
listed there is either dead data or a column the schema is genuinely missing, and
only a human can tell which.

**The dropped-field summary only catches fields that exist in production.** It
cannot report a column that is missing *and* not yet populated, because there is
no document to trip over. Migration 0006 is that case: `practitioner-portal.ts`
caches generated Kundli and Varshphal reports back onto `chatSessions` through an
ad-hoc cast, and the `ChatSessionRow` type does not declare them, so 0004 created
`chat_sessions` without the five cache columns. The copy script would have
quietly dropped them from every session and the ported endpoints would have
regenerated a full solar-return chart on every request.

It was found by auditing write sites instead, and that audit then found three
more. The low-noise version: collect every static key in any
`.add()`/`.set()`/`.update()` literal anywhere in `src/`, map it through
camelCase→snake_case, and report the ones that match **no column in any table**.
Per-collection attribution is what creates the false positives — a window-based
scan blames `bookings` for a `memberSubscriptions` write — and dropping it takes
the output from ~100 candidates to 5, of which 4 were words inside comments or a
ternary value. What survives is real:

| field | table | found in | consequence if missed |
|---|---|---|---|
| `kundliSummary`, `varshphalYear`, +3 | `chat_sessions` | 0006 | report cache dropped; chart regenerated per request |
| `refundClaimedAt` | `gemstone_orders` | 0005 | refund claim has no durable marker; double refunds |
| `paidViaBypass`, `paidFromWallet` | `ai_readings` | 0008 | a QA bypass reading is indistinguishable from revenue |
| `details` | `audit_logs` | 0009 | the admin Activity page's "what changed" column goes blank on every row |

`audit_logs` is the instructive one. 0004 gave it `before` and `after` jsonb
columns — a plausible audit shape that nothing in `src/` has ever written — while
the field all four write sites actually pass had no column at all. Deriving a
schema from the types produces the shape you expect, not the shape you have.

Two of these (`details`, and `gemstone_coupon_customer_usage` in 0005) would have
been reported by the copy script's stray-field summary rather than erroring, so
they are only caught at cutover if the operator reads that summary. The other two
would have failed loudly, mid-batch.

**Two documents sharing one primary key aborted the batch.** Postgres refuses a
multi-row `insert ... on conflict do update` that touches the same row twice
("ON CONFLICT DO UPDATE command cannot affect row a second time"). Ids
synthesised from a parent path can collide. Duplicates within a batch are now
collapsed last-wins — the same outcome separate upserts would have produced — and
reported.

The primary key is also now taken from the table spec rather than inferred from
the first row's keys, which previously fell through to "whatever column happened
to come first".

Then migrate auth:

```bash
node scripts/migrate-auth-users.mjs --dry-run --limit=10   # inspect 10 users first
node scripts/migrate-auth-users.mjs
```

The script prints `password-carryover=N` and `oauth-only=M`. OAuth-only accounts have no password to carry and need the Google provider configured in Supabase Auth before they can sign in.

Finally the remap:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/rewrite-auth-uids.sql
```

It runs in a single transaction, restores the schema's foreign-key actions before committing, and **aborts the whole transaction** if any Firebase uid survives in a remapped column. A partial remap would look like valid data and fail only at login time, so it refuses to leave one behind.

Re-running it is a no-op. Running it with an empty `auth_uid_map` aborts deliberately, because rewriting against an empty map would null out every member reference through the `ON DELETE SET NULL` keys.

## NOT NULL columns are the main way the copy can fail

The schema has **109 non-id `NOT NULL` columns without a default, across 55
tables** (counted against a freshly migrated database, not estimated). Firestore
is schemaless, so a field the app always writes may simply be absent from older
documents — and the insert then fails with `23502`, which aborts that table's
batch.

`practitioner_time_off.starts_at` was exactly this and has been made nullable:
time-off documents written before that field existed have none, and
`scheduling.ts` has always fallen back to `endsAt`.

Foreign keys make insertion order matter, and the `TABLES` array in
`migrate-firestore-to-supabase.mjs` is already in dependency order — `members`
(line 40), `practitioners` (45), `services` (46), then `bookings` (51). Keep it
that way when adding tables: `bookings.service_id` is a real foreign key, so a
booking inserted before its service fails with `23503`.

**Run the copy with `--dry-run` first, then read the end-of-run summary the script
prints.** It lists every field it filtered out against `information_schema`. The
same discipline applies in reverse: if a batch reports a `23502`, the column needs
either a default, to be made nullable, or to be filled during the copy — decided
per column, not guessed. The riskiest tables by column count are `bookings` (8),
`practitioner_reviews` (5) and `availability_rules` (4).

## Phase 4 — cutover (production)

Do not start until the two open items at the top of this document are complete. The Storage and browser-auth work is now in the repo, but has never touched the live project.

1. **Freeze writes.** Put the site in maintenance mode. A copy taken while bookings and wallet ledgers are changing cannot be made consistent afterwards.
2. **Final data copy.** `node scripts/migrate-firestore-to-supabase.mjs --verify`. Every table must report `postgres >= firestore`.
3. **Auth migration.** `node scripts/migrate-auth-users.mjs`. Idempotent — it skips any Firebase uid already in `auth_uid_map`.
   1. Create the destination Storage bucket first (default name `readings`, private). The copy script does not create it.
   2. **Copy the Storage objects.** `node scripts/migrate-storage-to-supabase.mjs --verify`. Run `--dry-run` first and check the object count against the Firebase console. `--verify` downloads each object back and compares bytes, so a truncated upload is reported rather than surfacing later as a broken image.
   3. **Backfill the coupon-usage columns.** Migration 0005 made `gemstone_coupon_customer_usage.coupon_code` and `.customer_identifier` nullable, because the Firestore documents store only `count` and `updatedAt` — the code and identifier live in the document id. Run the idempotent update at the foot of `supabase/migrations/0005_gemstone_order_refund_claim.sql` after the copy. Purely cosmetic (the application reads neither column) but it leaves the rows readable.
4. **Remap uids.** `psql ... -f scripts/rewrite-auth-uids.sql`. Watch for the four `raise notice` lines: uid pairs found, foreign keys re-installed, foreign keys restored, remap verified.
5. **Verify before flipping anything.** Row counts match; then sign in as a real member with a real password — that is the only proof the `$fbscrypt$` carry-over worked. Also replay the wallet ledger:
   ```sql
   select count(*) from wallet_entries e join wallets w on w.id = e.wallet_id
    where e.balance_after is null;   -- must be 0
   ```
6. **Flip the env vars** on the `astronomers.in` deploy: add the `SUPABASE_*` block, keep the Firebase block in place (the auth script and any rollback still need it).
7. **Deploy.**
8. **Smoke test in production.** Member sign-in, practitioner portal sign-in, one paid booking end to end, one wallet-funded chat session, one AI reading, one gemstone checkout, one webhook delivery (check `razorpay_events` for a new row).
9. **Exercise the erasure path on a throwaway account, and check the outcome in four places.** This is the newest port and the only flow that destroys data, so "the request returned 200" proves nothing — every bug found while building it reported success while doing nothing. Create a disposable member, give it a reading photo and an ended chat session, then delete it and confirm all four:
   ```sql
   -- (a) the member is gone, and so is everything cascade owns
   select count(*) from members where id = '<uid>';                       -- 0
   select count(*) from kundli_matches where member_id = '<uid>';         -- 0
   -- (b) money that must survive did
   select captured_amount, member_id from chat_sessions where id = '<session>';
   --    amount intact, member_id NULL — NOT a missing row
   select count(*) from subscription_invoices where member_id is null
     and id = '<invoice>';                                                -- 1
   -- (c) the retained booking is scrubbed but still joins to its invoice
   select client_name, client_email from bookings where id = '<booking>';
   select customer_email from invoices where booking_id = '<booking>';
   --    client_name = 'Deleted member'; both emails equal and anonymized
   ```
   Then **(d) outside the database**: the reading photo must be gone from the Storage bucket, and the GoTrue user must be gone from **Authentication → Users**. Both moved provider at cutover, and an earlier version of this code deleted from Firebase on both paths — so both silently no-opped, leaving the photos readable and the login still working. If either survives, stop and roll back: the account is not deleted, whatever the API said.
10. **Unfreeze and watch.** Keep the Firebase project running and the Firestore data untouched for a full billing cycle. `auth_uid_map` is the audit trail of who became whom — drop it only after that.

## Rollback

Before step 6 the change is entirely additive: the Firebase app is still the live one and nothing has been deleted. Rollback is "do nothing".

After step 6, roll back by reverting the env vars and redeploying. Firestore is untouched throughout, so the previous state is intact — but **any write that landed in Supabase between step 7 and the rollback is lost**. Keep that window short and do the cutover at the quietest hour you have.

## Silent fallbacks — read this before phase 4

Several read paths are deliberately resilient: they catch *any* error and return a
hardcoded fallback so a database hiccup degrades one section instead of 500ing a
marketing page. That is the right behaviour in steady state, and the wrong one
during a migration, because a misconfigured Postgres connection looks identical to
a working one from the outside.

`getAllPlans()` is the clearest case. Its catch block logs a warning and returns
`fallbackPlans()` — the built-in Plus and Pro tiers. So after cutover, if
`SUPABASE_DB_URL` is wrong or the credentials are missing, `/pricing` renders
plausible plans at plausible prices and nothing appears broken, while every custom
plan an admin created is invisible.

This was found by testing, not by reading: an integration test asserting
"got 2 plans back" passed while Postgres was never contacted, because the fallback
also returns two plans. The gate test now seeds a tier the fallback list cannot
contain and asserts it comes back — that assertion cannot pass on the fallback
path.

### A later `update` can hide the missing lock

The gemstone checkout needed the same treatment, and the first attempt failed a
different way. `insertPendingOrderInSupabase` reads each variant's stock under
`for update` and decrements it later in the same transaction. A test that held
the variant row locked in a second transaction and asserted the checkout had not
finished after 300 ms **passed with the `for update` deleted** — because the
`update … set stock_quantity = stock_quantity - n` a few statements later takes
the same row lock anyway, so the caller blocked regardless.

Two lessons:

- Blocking is not the same as locking the *read*. A test has to observe the value
  the read saw, not merely that the caller waited.
- Where the guard is a predicate rather than a lock, write it so the database
  enforces it in one statement. `claimRefundInSupabase` was a
  select-`for update`-then-update; no concurrency level made it fail with the lock
  removed, because the callers serialise before the window opens. It is now a
  single `update … where refund_claimed_at is null returning …`, where
  `rowCount = 1` *is* the claim. Deleting that predicate now fails the test.

### A foreign key can hide a missing row lock, and a cold pool can hide a race

Two more ways the mark-paid lock looked tested when it was not.

`payments.invoice_id` is a foreign key to `invoices.id`. An insert into `payments`
takes a `FOR KEY SHARE` lock on the referenced invoice row, which conflicts with
`FOR UPDATE`. So a test that held the invoice row locked and then checked that no
payment had been written **passed with the `select … for update` deleted** — the
insert blocked on the foreign-key check instead. Holding a lock only proves the
caller waits for that lock; it says nothing about which statement takes it.

The concurrency test — 20 simultaneous `markInvoicePaid` calls, expecting exactly
one payment row — also passed with the lock deleted, because `getPgPool()` opens
connections lazily. The calls staggered while connecting and never overlapped.
Issuing ten throwaway queries first to warm the pool made the same test fail on
the mutated code and pass on the real one.

If a concurrency test is meant to prove a lock, warm the pool before firing it,
and check whether a foreign key is doing the serialising instead.

## A rule duplicated in SQL needs numbers that can tell the two apart

`backfillInvoicesInSupabase` creates an invoice for every booking that lacks one
as a single anti-join statement, replacing a Firestore loop that paged bookings
in batches of 25 and probed `invoices/{bookingId}` for each. That means the
invoice-number derivation and the GST split now exist twice: once in TypeScript
(`invoiceNumber`, `splitGstInclusive`) and once in SQL.

The test that compares them passed while the SQL used `trunc` instead of `round`,
because the seeded prices — 1180, 590, 2360 — all divide evenly by 1.18. Rounding
never happens, so the two rules look identical. The test now uses 1004, 999 and
1234, whose subtotals are 850.85, 846.61 and 1045.76, and asserts as a premise
that each amount really does have a fractional subtotal — so if the numbers are
ever changed to convenient ones, the test fails instead of quietly proving
nothing.

When a rule is duplicated across a language boundary, pick inputs where the two
implementations would disagree, and assert that they disagree.

## Integration tests share one database, so cleanup has to be scoped

Vitest runs test *files* in parallel against the same Postgres. `postgres.integration.test.ts`
began life with an unscoped `delete from public.bookings` — and the same for
`services`, `practitioners`, `members` and the wallet tables — in both `beforeAll`
and `afterAll`. That wiped whichever rows another file was mid-assertion on, so
`booking-creation` failed roughly one run in five with a foreign-key violation on
a practitioner that had existed a moment earlier.

Two things to take from it:

- A suite that passes four times and fails once is not flaky infrastructure. Find
  the writer. `grep -n "delete from public\." src/lib/*.integration.test.ts` and
  look for a delete with no `where`.
- Scoping by prefix is not the same as scoping by owner. `like 'itest%'` looks safe
  and would still have deleted `chat-supabase`'s `itest-prac-%` fixtures. Delete
  the exact ids your file creates.

Also worth knowing: a suite whose `beforeAll` throws reports its tests as
**skipped**, not failed. "12 skipped" reads like "not run"; it can mean "the seed
blew up". Re-run clean before drawing any conclusion from a skip count.

## A concurrency test that passes is not evidence of a lock

`requestPayout` totals what has already been paid and requested, then refuses the
request if the amount exceeds what remains. Firestore made that atomic with
`runTransaction`; Postgres needs an explicit `select … for update` on the
practitioner row. The lock is there — but proving it is harder than it looks.

The first test fired five concurrent ₹1000 requests against ₹2500 earned and
asserted exactly two succeeded. **It passed with the lock removed.** So did a
ten-request version. At that concurrency the requests serialise on connection-pool
contention by accident, so the race never appears. A probe with different numbers
showed the race was genuinely reachable: without the lock, four of five requests
succeeded and **₹4000 was promised against ₹3000 earned**.

The test that actually works forces the overlap instead of hoping for it. It calls
`createPayoutRequestInSupabase` directly and makes the `decide` callback — which
runs inside the transaction, after the lock — sleep for 200 ms. Two requests for
the full remaining balance are fired together:

- **locked:** the second blocks on `for update` before `decide` is reached, so it
  sees the first as pending and is refused. One succeeds.
- **unlocked:** both enter, both read `pendingOut = 0`, both insert. Two succeed.

Confirmed: removing the lock makes that test fail with "expected length 1 but got
2". Note this shape cannot deadlock the locked path, precisely because the second
request is blocked before it can reach the barrier.

**Generalise this:** for any check-then-act code, write the mutation check before
trusting the test. If deleting the lock does not fail it, the test proves nothing.

**Before flipping `SUPABASE_CUTOVER`, audit every `catch` that returns a fallback
in the modules you port**, and consider making those paths fail loudly while the
migration is in progress.

## Porting a module — four things the wallet port got wrong

`wallet.ts` is the worked example, and every one of these was a real defect found
by its integration test rather than by reading the code. They will recur in the
remaining modules.

1. **Reads inside a transaction must use the transaction client.** `createHold`
   created a row and then read it back with `getHoldFromSupabase()`, which goes
   through the pool. That is a different connection, so it could not see the
   uncommitted row, returned `null`, and the hold threw and rolled back every
   single time. Use `client.query` for anything read inside `withTransaction`.
2. **`client.query` returns snake_case; `queryModel` returns camelCase.** Typing a
   transaction read as the camelCase row type compiles happily and silently
   produces `walletId: undefined`. Route transaction reads through
   `rowToCamel(row, NUMERIC_COLUMNS)` — see `mapHoldRow` in `wallet-supabase.ts`.
3. **Every mutating money operation needs `select ... for update`.** Firestore
   transactions retry on read conflicts; Postgres does not. Removing the lock from
   `debitWalletInSupabase` lets 20 concurrent debits of 100 all "succeed" against a
   balance that funds 8, each writing back its own stale total. The row lock is
   what serialises them.
4. **A concurrency test has to force real overlap.** The first version fired two
   debits and asserted exactly one won — and it still passed with the lock
   removed, because against a local database on a warm pool the second read lands
   after the first commit by sheer timing. Twenty concurrent debits do overlap, and
   that version fails without the lock. Against a real Supabase round-trip the
   timing is completely different, so do not trust a local run that passes.
5. **Anything read through `query()` needs `rowToCamel`, including `returning`.**
   `queryModel`/`queryModels` map snake_case to camelCase for you; plain `query()`
   does not. This bit twice — once on a transaction read in `wallet-supabase.ts`
   and again on the `insert ... returning` / `update ... returning` clauses in
   `chat-supabase.ts`, where it produced `pricingModel: undefined`. The
   message-insert variant is the worst kind: the row goes straight to
   `publishChatEvent`, so the browser receives `sender_type` and renders an empty
   bubble rather than anything that looks like an error. Declare a
   `Sql<Thing>Row` type with snake_case keys and map it explicitly.

**Testing a gated module in vitest.** If anything in its call graph reaches
`getStudioSettings()`, mock `@/lib/studio-settings` — `unstable_cache` throws
`Invariant: incrementalCache missing` outside a Next runtime. `wallet.ts` reaches
it for the currency, so `chat.ts` reaches it too. Mock `@/lib/ably` (network) and
`@/lib/gemini` (API key) as well. Keep genuinely pure modules like
`practitioner-pricing.ts` unmocked so the real business logic is what runs.

## Three rules the gemstone tables enforce that Firestore never did

The gemstone admin CRUD is the first ported module where Postgres is *stricter*
than the database it replaces, so cutover will reject some saves that used to
succeed. Each one is deliberate and each has a test:

- **At most one primary image per product.** `gemstone_product_images_one_primary`
  is a partial unique index on `product_id` where `is_primary`. Firestore had no
  equivalent, so a product saved with two images both flagged primary still
  exists in live data — and now fails to save. Re-save such a product with a
  single primary before cutover; `select product_id from gemstone_product_images
  where is_primary group by product_id having count(*) > 1` finds them.
- **Variant SKUs are globally unique.** `gemstone_product_variants.sku` is unique
  where `sku <> ''`. The Firestore admin let two products share a SKU. The empty
  string is excluded on purpose so drafts without a SKU do not collide.
- **Slugs are unique per table.** `gemstone_categories.slug` and
  `gemstone_products.slug`. Both writers pre-check, then also map
  `isUniqueViolation()` back to the same `GemstoneError`, because the pre-check
  races a concurrent save and the constraint is the real guard.

`gemstone_products` has **no price column** — the storefront price is the cheapest
*active* variant, computed by the reads twin. An admin save must never invent one.

Two deletes are guarded in application code, not by the database.
`gemstone_order_items.product_id` is deliberately not a foreign key, so nothing
stops a product with existing orders from being deleted; `deleteProduct` checks
for order items and refuses, and `deleteCategory` refuses while products still
reference it. Both guards are mutation-tested: removing either one turns its test
red.

## Things that will look wrong but are not
- `gemstone_order_items.product_id` and `variant_id` are not foreign keys. An order must keep its line items after a product is deleted, which is why the app already snapshots `product_name` and `variant_label`.
- `notifications.recipient_id` is not a foreign key. It is polymorphic across members, practitioners and admins.
- `kundli_matches` has both `name_a`/`birth_date_a` and `person_a_name`/`person_a_birth_date` columns. The document shape evolved and both spellings exist in live data; keeping only one would drop rows.
- `site_content`, `audit_logs.before/after`, `custom_pages.blocks`, `ai_readings.tarot_cards` and `kundli_matches.timeline` are `jsonb`. These are heterogeneous or read-as-a-unit; normalising them would be a rewrite, not a migration.
