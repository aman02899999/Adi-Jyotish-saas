# Humanizer skill (vendored)

Source: [blader/humanizer](https://github.com/blader/humanizer) v3.1.0 by Siqi Chen
(MIT, see `HUMANIZER-LICENSE`), installed as a project skill instead of as a plugin.

## What is here

- `.claude/skills/humanizer/SKILL.md`: the whole skill. It is Markdown only and runs
  no scripts or tools. Invoke with `/humanizer` or ask Claude to "humanize" a piece of text.

Use it on marketing copy, blog posts, social captions and emails before they go out.
It must not add facts, so it is safe on health and pricing copy, but still review the output.

## Changes from upstream

- `SKILL.md` copied unchanged.
- Not vendored: `.claude-plugin/` and `.cursor-plugin/` manifests, `agents/openai.yaml`,
  the `validate.yml` GitHub workflow, `scripts/validate-package.py`, issue templates,
  `README.md`, `CHANGELOG.md` and `AGENTS.md`. None of them are needed for the skill to load.

Update by re-copying `SKILL.md` from a new release and reviewing the diff.
