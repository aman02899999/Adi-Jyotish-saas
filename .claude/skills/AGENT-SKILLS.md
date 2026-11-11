# Agent Skills (vendored subset)

Source: [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) v0.6.13 by Addy Osmani
(MIT, see `AGENT-SKILLS-LICENSE`), installed as project skills instead of as a plugin.

## What is here

Only the 12 skills that add something the Superpowers skills do not already cover:

| Skill | Use it for |
|-------|-----------|
| `api-and-interface-design` | REST/GraphQL endpoints, module boundaries, public interfaces |
| `observability-and-instrumentation` | Logging, metrics, tracing, alerting |
| `performance-optimization` | Measuring and fixing slow pages, queries and bundles |
| `security-and-hardening` | Input handling, auth, secrets, OWASP and LLM-app risks |
| `documentation-and-adrs` | Architecture decision records and docs |
| `deprecation-and-migration` | Removing old APIs or features and migrating callers |
| `ci-cd-and-automation` | Build and deploy pipelines, quality gates |
| `context-engineering` | Setting up agent context (CLAUDE.md, rules, session hygiene) |
| `source-driven-development` | Checking an approach against official docs before coding |
| `constraint-driven-development` | Writing a `CONSTRAINTS.md` quality bar and enforcing it |
| `browser-testing-with-devtools` | Testing in a real browser through Chrome DevTools MCP |
| `shipping-and-launch` | Pre-launch checklist and rollout |

Also included: the `security-auditor` and `web-performance-auditor` agents in `.claude/agents/`,
and the shared checklists the skills link to in `.claude/references/` (skills reference them as
`../../references/<file>.md`).

## Left out, and why

- Duplicates of Superpowers skills: `test-driven-development` (same name), `idea-refine`,
  `interview-me`, `spec-driven-development`, `planning-and-task-breakdown`,
  `incremental-implementation`, `debugging-and-error-recovery`, `code-review-and-quality`,
  `doubt-driven-development`, `git-workflow-and-versioning` and the `using-agent-skills` router.
- `frontend-ui-engineering` (overlaps UI/UX Pro Max) and `code-simplification` (overlaps the
  built-in `/simplify`).
- The `code-reviewer` and `test-engineer` agents, which pair with the skipped skills.
- Slash commands (`/spec`, `/plan`, `/build`, `/test`, `/review`, ...): they mostly drive the
  skipped skills, and `/review` collides with a built-in command.
- Hooks (session-start router injection, doc-fetch cache, simplify-ignore), plugin manifests,
  Gemini/Codex files, evals, validation scripts and the upstream GitHub workflow.

## Changes from upstream

- Cross-references to skipped skills point at the Superpowers equivalents:
  `debugging-and-error-recovery` to `systematic-debugging`, `code-review-and-quality` to
  `requesting-code-review`, `interview-me` to `brainstorming`.
- The two agents no longer mention `/ship`, `/webperf` or the skipped agents.
- `orchestration-patterns.md` and `testing-patterns.md` are not vendored (only skipped skills used them).

Update by re-copying these directories from a new release and re-applying the edits above.
