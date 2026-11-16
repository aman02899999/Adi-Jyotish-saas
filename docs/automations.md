# Background jobs and the health check

Brought over from the owner's gym site (`aman02899999/premium-health-platform`) and adapted to this
site. No gym content, data or secrets were copied.

## What is here

| Piece | What it does | Where |
|---|---|---|
| Daily schedule | Runs every registered job each morning (01:30 UTC, 07:00 India) and retries failures in the evening (13:30 UTC). On the Hobby plan each can fire anywhere inside its hour. | `vercel.json`, `src/app/api/cron/daily` |
| Off switch, dry run, retry, run record | Every job is off until its setting says `dry-run` or `on`. A dry run works out what it would do and records it, without sending anything. A failure is tried once more at once, and again by the evening run. Every run leaves a row. | `src/lib/automation/` |
| Run record | `system_status` (Firestore collection now; Postgres table from migration `0017` after the cutover). Counts and page addresses only. | `src/lib/automation/system-status.ts` |
| Health check | `/api/status`: is the database reachable, did each switched-on job run, is a test-only payment bypass on in production, can Razorpay confirm payments, can email send, is the AI allowance used up. Emails `ALERT_EMAIL` once per problem per day. The public answer lists failing check names only. | `src/lib/observability/` |
| Hourly uptime check | From GitHub, outside the host: four money pages plus `/api/status`. A failed run emails the repository owner. | `.github/workflows/cron.yml` |
| Search engine ping (IndexNow) | First registered job. Sends changed page addresses to Bing's index. Google does not take part. | `src/lib/indexnow.ts` |
| Cost guards | Tests that stop a new page rebuilding more often than every 6 hours, and a new public file of 1 MB or more. | `src/lib/isr-budget.test.ts`, `src/lib/public-file-size.test.ts` |

## Settings (names only; set them in Vercel, never in chat)

| Setting | Meaning |
|---|---|
| `CRON_SECRET` | The schedule's password. Without it the schedule refuses to run in production. |
| `ALERT_EMAIL` | Where health alerts go. |
| `AUTOMATIONS` | `off` stops every job at once. |
| `AUTOMATION_INDEXNOW` | unset or `off`, `dry-run`, or `on`. |

## Adding a job

One entry in `registry.ts` (key, label, switch name) and one in `jobs.ts` (what it does, honouring
`dryRun`). The switch, retry, run record and "didn't run" alert come with it.

## Gym automations and what happened to each

| Gym automation | Here | Why |
|---|---|---|
| Scheduler password check | Brought over | Same need. |
| `system_status` run record | Brought over, rewritten for Firestore and Postgres | The gym stores it in Postgres only. |
| `/api/status` watchdog with once-a-day alerts | Brought over, with this site's rules | The gym's rules watch WhatsApp, Reels and its own tables. |
| Hourly uptime workflow | Brought over | |
| IndexNow ping | Brought over | |
| Rebuild and file-size guards | Brought over | |
| Morning messages, campaigns, lead follow-ups, call list | Not brought over | Built around gym leads and WhatsApp. Customer email needs recorded consent first (Phase 3 and 4). |
| Nightly Razorpay reconciliation | Not yet | Phase 2. It must be tested against Razorpay test keys before it touches money records. |
| Instagram and Facebook posts, Stories, Reels, month plan | Not yet | Needs the owner's choice of accounts and brand, and astrology content. The gym's cards are gym content. |
| YouTube Shorts on the GitHub runner, long videos, music generator | Not yet | Same, plus the owner's sign-in to a channel. |
| WhatsApp flows and auto-replies | Not yet | Paid per message; bot and human numbers not chosen. |
| Admin morning digest | Not yet | Needs revenue numbers the site can read reliably first. |
| Meta Conversions API, attribution | Not yet | Belongs with conversion tracking. |
| Cloud Run tick, Android app, holding page | Not brought over | Specific to the gym's hosting move. |
