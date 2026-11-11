# Hallmark skill (vendored)

Source: [Nutlope/hallmark](https://github.com/Nutlope/hallmark) v2.0.0 (MIT, see
`HALLMARK-LICENSE`), installed as a project skill instead of with `npx skills add -g`.

## What is here

- `.claude/skills/hallmark/`: one skill. `SKILL.md`, 48 themes and 21 page layouts in
  `references/`, and Node scripts in `scripts/`:
  - `sloplint.mjs`: a static design linter for `.html`, `.css`, `.tsx`, `.jsx`, `.vue`,
    `.svelte` and `.astro`. Offline, reads files only.
  - `sloplint-render.mjs`, `capture.mjs`, `picture.mjs`: browser checks and screenshots.
    They need `puppeteer-core` and Chrome; without them the static checks still run.
  - `theme.mjs`: deals themes and picks photos from `photos.json` (755 Wikimedia Commons
    photos, links only). It downloads photos only when called with `--save`.
  - `refcheck.mjs`: the skill's own consistency check.

Invoke with `/hallmark <prompt>`, `/hallmark audit <path>` or `/hallmark redesign <path>`.
It does not touch an existing page unless you name it.

## When to use it here

- A brand-new standalone page, such as a campaign landing page, where the design is open.
- `/hallmark audit <path>` for a second opinion on an existing page. Read the report as
  advice: it has not been run on this site yet, and it scores house style choices (colour
  values outside tokens, no Hallmark stamp) as failures. Do not chase a clean sloplint
  score on the existing site; act on the accessibility findings.

Its rules sit under this project's rules, not above them. Prices, ratings, numbers and
testimonials still come only from the `src/lib/*-defaults.ts` modules, `src/lib/services.ts`
and the admin. The honesty, astrology and ads rules in `CLAUDE.md` still apply.

## Changes from upstream

- Left out: `scripts/install.mjs` and `scripts/install-hook.mjs` (they write to
  `~/.claude` and `.claude/settings.json`), `scripts/lint-hook.mjs` (the hook it installs),
  `scripts/imagegen.mjs` (paid Together AI image API, needs `TOGETHER_API_KEY`) and
  `agents/openai.yaml` (Codex only).
- `references/flow.md` and `references/comp.md` edited to say those parts are not here, so
  the "comp before build" step never runs.
- Not vendored: the marketing site (`site/`, 56 MB), `docs/` screenshots, `eval/` (calls
  paid model APIs), plugin manifests, `vercel.json` and the upstream GitHub workflow.

Update by re-copying `skills/hallmark/` from a new release, removing the same files, and
running `node .claude/skills/hallmark/scripts/refcheck.mjs` (it must print "clean").
