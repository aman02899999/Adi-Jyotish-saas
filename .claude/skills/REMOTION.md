# Remotion skills (vendored)

Source: remotion-dev/skills v4.0.538 (the `packages/skills` folder of the Remotion
monorepo), copied as-is into `.claude/skills/remotion-*/` instead of via
`npx skills add remotion-dev/skills`.

## What is here

- `remotion-best-practices/` — router skill. It bundles its own copies of the other
  skills under `REFERENCE.md` files, so most of the 3.6 MB is duplicated content.
- `remotion-create`, `-markup`, `-studio`, `-render`, `-maps`, `-captions`,
  `-multimedia`, `-interactivity`, `-saas`, `-docs`, `-upgrade` — the standalone skills.

## Notes

- This repo has no Remotion project and no video pipeline yet; these skills only apply
  if a Remotion project is added.
- Remotion itself is under the Remotion License: free for individuals and companies of
  up to 3 people, a paid company licence above that (https://remotion.dev/license).
- Some skills reference third-party keys (ElevenLabs voiceover, Mapbox/MapTiler/Google
  map tiles). Keep them in env vars, never in code.
- The `.ts`/`.tsx`/`.mjs` examples are not built: `tsc` skips dot-folders and ESLint
  ignores `.claude/**`.
- Not vendored: the upstream `scripts/` (README/sync tooling), `package.json`, `tsconfig.json`.
  Update by re-vendoring and reviewing the diff.
