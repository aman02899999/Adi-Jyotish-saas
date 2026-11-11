# Superpowers skills (vendored)

These skills come from [obra/superpowers](https://github.com/obra/superpowers) v7.0.1 (MIT, see `SUPERPOWERS-LICENSE`).
Claude Code picks up every folder here as a project skill.

What was changed from upstream:

- Skill references like `superpowers:writing-plans` were rewritten to `writing-plans`, since project skills have no plugin prefix.
- `diagnosing-superpowers` was left out. It reads past session transcripts and drafts bug reports for the upstream repo, which is not useful here.
- The plugin's SessionStart hook was not installed. It only injects `using-superpowers/SKILL.md` into every session; ask for that skill when you want the full workflow.

Working files the skills create go under `.superpowers/`, which is git-ignored.

To update, replace these folders with a newer release and re-apply the changes above.
