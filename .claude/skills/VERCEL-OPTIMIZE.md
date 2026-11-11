# Vercel Optimize skill (vendored)

Source: [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), `skills/vercel-optimize`
v1.2.0 (commit `063bee9`, 28 Aug 2026), by Vercel Engineering. MIT, as stated in the upstream
README and `SKILL.md`; upstream ships no separate LICENSE file. Installed as a project skill
(the same result as `npx skills add vercel-labs/agent-skills --skill vercel-optimize`, but in
`.claude/skills/` and reviewed first).

## What it does

A metrics-first Vercel cost and speed audit. It pulls 14 days of production metrics, usage and
project config through the Vercel CLI, scans the code, picks the routes the metrics point at, and
writes a ranked report with file and line references and checked doc links.

## Read-only on Vercel

Audited before vendoring. Every Vercel call goes through `lib/vercel.mjs` and is one of
`vercel whoami`, `vercel metrics`, `vercel usage`, `vercel contract` or a GET through
`vercel api` (`/v9/projects/<id>`, `/v2/teams/<id>`, `/v2/user`,
`/v1/observability/manage/configuration/projects`). No POST, PATCH, PUT or DELETE, no env, deploy
or project-update commands. The only network access is through the Vercel CLI. Scripts use Node
built-ins only (no npm install), write only to the run directory you pass them, and redact
tokens in error output. The skill tells the agent to run `vercel link`, which only writes the
local `.vercel/` folder (already in `.gitignore`).

Project rule still applies: the report recommends changes, it never makes them. Any Vercel
setting change (regions, Fluid compute, Observability Plus, Web Analytics) needs the owner's
go-ahead first.

## What it needs to give its full output

1. Vercel CLI v53 or newer, logged in (`vercel login`) on the machine running the audit. The
   cloud container has no CLI or Vercel login, so the full audit runs on the owner's computer.
   Never paste a Vercel token into chat.
2. The repo folder linked to the project (`vercel link`).
3. **Observability Plus** (a paid Vercel add-on on Pro) for route-level metrics. Without it the
   skill stops and offers a limited code-only run.

## Overlap with existing skills

- `performance-optimization` (skill) and `web-performance-auditor` (agent) cover Core Web Vitals
  and code-level speed work. They do not read Vercel metrics, usage or bills.
- What only this skill adds: Vercel usage and cost breakdown (Function Invocations, Build Minutes,
  Fast Data Transfer), per-route cache-hit and duration data, and 15 Vercel-specific code scanners.
- Without Observability Plus it mostly duplicates the two above.

## Offline scanner works today

`node .claude/skills/vercel-optimize/scripts/scan-codebase.mjs .` needs no Vercel login. On
24 Oct 2026 it scanned 992 files and 342 routes and listed 253 findings: 138 `force-dynamic`,
85 missing cache headers, 23 unoptimized images, 4 large static assets
(`public/anatomy/*.glb`, the sample diet-plan PDF), 2 `headers()` calls in a page, and
`vercel.json` pinning functions to `icn1` (Seoul). These are leads, not fixes: the skill's own
rules drop route findings that have no traffic data behind them.

## Changes from upstream

None. The folder is copied unchanged. Update by re-copying `skills/vercel-optimize` from a new
upstream commit and reviewing the diff.
