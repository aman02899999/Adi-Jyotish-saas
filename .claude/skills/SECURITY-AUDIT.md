# Security Audit (vendored)

Source: [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill)
(MIT, see `SECURITY-AUDIT-LICENSE`), copied unchanged into `.claude/skills/security-audit/`.

## What it is for

A full, multi-agent security audit of this codebase: reconnaissance, coverage-led hunting,
independent verification of every candidate, and a report that only calls something
"confirmed" when there is a real trust-boundary failure with evidence. Use it for Phase 7 of
the program in `CLAUDE.md`.

It complements the tools we already have rather than replacing them:

| Tool | Use it for |
|------|-----------|
| `security-and-hardening` skill | Writing new code safely (input handling, auth, secrets) |
| `security-auditor` agent | A quick single-pass review of one area or PR |
| `.claude/references/security-checklist.md` | The checklist both of the above follow |
| built-in `/security-review` | Reviewing the security of the current diff |
| `security-audit` skill (this) | The whole-codebase audit with a coverage ledger and verified findings |

The skill is guidance-only by default. It runs the full six-phase audit only when asked
explicitly ("security audit this codebase", "full security review").

## Companion files that matter here

For this Next.js + Firebase (Supabase dormant) + Razorpay site the relevant hunting guides are
`WEB-PROTOCOL-AND-AUTH.md`, `CLIENT-SIDE.md`, `PROTOCOLS-RPC-AND-MESSAGING.md` (webhooks),
`DATA-ISOLATION-AND-LIFECYCLE.md`, `CLOUD-AND-DEPLOYMENT.md`, `SUPPLY-CHAIN-AND-RELEASE.md`,
`RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` and `AI-AND-LLM.md` (the bots).
`MEMORY-SAFETY-AND-BINARY.md` and `DESKTOP-MOBILE-AND-LOCAL-IPC.md` won't apply but are kept so
the skill's internal links stay intact.

## House rules that apply on top

- The skill itself forbids probing deployed endpoints. Keep it that way: never point it at
  astronomers.in, Razorpay, Firebase or Supabase production. Source and local sandbox only.
- Output goes outside the repo (default `~/security-audit-skill/<repo>/run-<N>`). Do not commit
  audit reports; they can describe unfixed holes.
- Findings become fixes through the normal shipping flow (branch, tests first, draft PR).

## Limits

- The two validators (`validate-findings.cjs`, `validate-coverage-ledger.cjs`) need Node and
  refuse to run where Node has no `O_NOFOLLOW`, which includes native Windows. Run audits in a
  cloud session, Linux, macOS or WSL.
- A full `standard` run launches many sub-agents and is token-heavy. Start with a `quick`
  profile or a scoped run (for example only `src/app/api/`).
- Repeated runs find more; one run is never complete coverage.

## Left out

Only the upstream `README.md` (its install steps use `npx skills add`, which isn't how this repo
installs skills). Nothing else in the upload was dropped: there are no hooks, CI workflows,
self-updaters or network calls. The `.cjs` files use only `fs`, `path` and `util`; their tests
(65/65 passing) are kept. Vitest only collects `src/**`, and ESLint ignores `.claude/**`, so
none of it touches the app's checks.
