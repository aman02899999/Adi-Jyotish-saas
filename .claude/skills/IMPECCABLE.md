# Impeccable design skill (vendored, guidance only)

Source: [pbakaus/impeccable](https://github.com/pbakaus/impeccable) v4.7.1 by Paul Bakaus
(Apache 2.0, see `IMPECCABLE-LICENSE`), installed as a project skill instead of with
`npx impeccable install`.

## What is here

- `.claude/skills/impeccable/`: `SKILL.md` and 30 Markdown references. Invoke with
  `/impeccable <command> <target>`, for example `/impeccable critique /pricing`,
  `/impeccable polish src/app/[locale]/page.tsx`, `/impeccable harden /book`.
- `.claude/agents/impeccable-finish-reviewer.md` and `impeccable-documenter.md`: read-only
  review and DESIGN.md writing, used at the end of a new-work build.

Useful commands for this site: `critique`, `audit`, `polish`, `layout`, `typeset`,
`clarify` (UX copy), `harden` (errors, overflow, Hindi text), `adapt` (mobile), `optimize`,
`distill`, `quieter`, `init` (writes `PRODUCT.md`) and `document` (writes `DESIGN.md`).

## How it fits with the other design skills

- `ui-ux-pro-max`, `design-system`, `ui-styling`, `brand`, `design`: lookup tables and
  generators (palettes, font pairs, styles, tokens, logos). Use them to find options.
- `impeccable`: a design director's workflow and quality floor. Use it to judge and fix a
  real page. No skill names clash.
- `accessibility-checklist.md`, `performance-optimization`, `web-performance-auditor` stay the
  source of truth for WCAG and Core Web Vitals targets; `impeccable audit` is a quicker pass.
- `humanizer` still runs on every piece of customer-facing text `clarify` produces.

## Changes from upstream

- **No engine.** Upstream's `scripts/impeccable` launcher downloads a native binary from
  GitHub Releases on first run. That binary holds the 62-rule detector, the live browser
  mode and the "concept-seed" direction roll, which calls `https://impeccable.style/api`
  and sends choice telemetry unless `DO_NOT_TRACK` is set. None of it is vendored. `SKILL.md`
  Setup was rewritten so the agent reads `PRODUCT.md`/`DESIGN.md`/`CLAUDE.md` itself and does
  the detector's job by hand (it already has a "launcher unavailable" fallback upstream).
- **No hooks.** Upstream `.claude/settings.json` runs the engine on SessionStart, after every
  Edit/Write and on Stop. Left out.
- Left out: `live`, `generate`, `hooks`, `doctor` and the comp/plate pipeline
  (`component-review.md`, `region-map.md`, `visualize.md`, asset-producer and
  manual-edit-applier agents), which need the engine or an image generator; iOS/Android
  references (web-only repo); all other agent harness folders, `crates/`, `cli/`,
  `extension/`, `browser-bundle/`, `tests/`, CI workflows and the 1.1 MB font index.
- `SKILL.md` gained a "House rules win" paragraph pointing at CLAUDE.md §2–§3. The other
  references are copied unchanged.

Update by re-copying `skill/reference/*.md` and the agents from a new release, re-applying
the Setup rewrite, and reviewing the diff.

## If you want the detector later

On your own machine you can run `npx impeccable detect <path>` with `DO_NOT_TRACK=1` set. Do
not add the hooks to this repo: they would run a downloaded binary after every edit.
