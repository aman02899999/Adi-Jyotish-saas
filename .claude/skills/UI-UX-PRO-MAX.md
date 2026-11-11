# UI/UX Pro Max skills (vendored)

Source: ui-ux-pro-max-skill v2.15.0 by nextlevelbuilder (MIT, see `UI-UX-PRO-MAX-LICENSE`),
installed as project skills from the plugin's `.claude/skills/` folder instead of via
its plugin marketplace entry or `uipro` CLI.

## What is here

- `.claude/skills/ui-ux-pro-max/` — the core skill. A local, offline search over CSV data
  (styles, palettes, font pairings, UX guidelines, per-stack rules). Python standard
  library only, no network. Run from the repo root:

  ```bash
  python3 .claude/skills/ui-ux-pro-max/scripts/search.py "astrology spiritual premium" --design-system -p "Astronomers"
  python3 .claude/skills/ui-ux-pro-max/scripts/search.py "form validation" --stack nextjs
  ```

- `brand/`, `design-system/`, `design/`, `banner-design/`, `slides/`, `ui-styling/` —
  companion skills bundled with the plugin (authored by claudekit).

## Changes from upstream

- `${CLAUDE_PLUGIN_ROOT}/.claude/skills/...` paths in `ui-ux-pro-max/SKILL.md` rewritten
  to the project-relative `.claude/skills/...`.
- Not vendored: the `uipro` CLI (fetches releases from GitHub), the `stack/` kit (adds
  an MCP server, `.claude/settings.json` and a GitHub workflow), `gallery/`, `projects/`,
  upstream CI workflows, `tests/` folders, and a stray `.coverage` file.

## Things to know

- `design` can generate logos/icons/mockups through paid third-party image APIs
  (Google Gemini, Atlas Cloud, MuAPI). Opt-in only: nothing runs without
  `GEMINI_API_KEY` / `ATLASCLOUD_API_KEY` / `MUAPI_API_KEY` set. Prompts go to those vendors.
- `ui-styling/scripts/shadcn_add.py` runs `npx shadcn@latest add ...`. This site uses
  Tailwind v4 but not shadcn/ui; do not let it initialise shadcn without a decision.
- `brand`, `design-system` and `slides` scripts read and write `docs/brand-guidelines.md`
  and `assets/design-tokens.*` relative to the working directory.
- Overlaps with other skills available in sessions: `design:design-system`,
  `small-business:brand-style`, `anthropic-skills:brand-guidelines`, `anthropic-skills:pptx`.
  If both trigger, name the one you want.
