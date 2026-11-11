# GEO-SEO skills (vendored)

Source: geo-seo-claude by Zubair Trabzada (MIT, see `GEO-SEO-LICENSE`), installed
as project skills instead of via its `install.sh` (which writes to `~/.claude`).

## What is here

- `.claude/skills/geo/` — router skill (`/geo audit <url>`, `/geo quick`, `/geo schema`, ...)
  plus `scripts/`, `schema/` JSON-LD templates, `templates/` for PDF reports.
- `.claude/skills/geo-*/` — 14 sub-skills.
- `.claude/agents/geo-*.md` — 5 subagents used by `/geo audit`.

## Changes from upstream

- Paths rewritten from `~/.claude/...` to the project-relative `.claude/...`.
  Run Claude from the repo root.
- `geo-update` removed: it re-clones from GitHub and overwrites files in place.
  Update by re-vendoring and reviewing the diff.
- Not vendored: `install.sh`, `install-win.sh`, `uninstall.sh`, the star-history
  GitHub workflow (it pushes to a `gh-pages` branch), `examples/`, `tests/`, `white-label/`.

## Python dependencies (optional)

Several skills call `python3 .claude/skills/geo/scripts/fetch_page.py` and friends. They need:

```bash
python3 -m venv .venv-geo && . .venv-geo/bin/activate
pip install -r .claude/skills/geo/requirements.txt
```

`playwright` is only for screenshots. No API keys are required. The scripts make
outbound HTTP requests only to the site being audited and public sites (Wikipedia,
Wikidata, Reddit, YouTube etc.) for brand-mention checks.

`/geo prospect`, `/geo proposal` and `/geo compare` are agency CRM tools; they write
to `~/.geo-prospects/` outside the repo.
