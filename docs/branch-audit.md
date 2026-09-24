# Branch audit — 2026-09-22

A record of what every remote branch contained and what was done with it, so the
same investigation does not have to be repeated. Branches marked **delete** carry
nothing main does not already have; leaving them in place only makes the next
audit longer.

## Merged

| Branch | Unique commits | Action |
| --- | --- | --- |
| `arena/01a079b9-adi-jyotish-saas` | 8 | **Merged.** Supabase/Postgres migration — schema, copy scripts, provider-gated ports, health probe. 193 files, ~27k lines. Safe to merge because it is dormant: every ported read/write branches on `isSupabaseCutoverActive()`, which needs both valid credentials and `SUPABASE_CUTOVER=true`. With the flag unset the app runs today's Firestore paths unchanged. |
| `claude/website-saas-conversion-0agq71` | 1 | **Cherry-picked.** Downscales palm/face reading photos before they reach Gemini. Gemini bills vision input per 768×768 tile, so a 12MP phone photo cost ~6,200 tokens against ~270 for a whole text reading. 6–12× cheaper per reading, plus EXIF rotation and JPEG normalisation. |

## Already in main — delete

| Branch | Why |
| --- | --- |
| `arena/01a07196-adi-jyotish-saas` | Zero diff against main. Landed as PR #23 (self-service data export and account deletion). |
| `arena/01a06ebf-adi-jyotish-saas` | Behind main. Merging it would *remove* the privacy feature — it predates PR #23. |
| `feature/razorpay` | 0 ahead, 133 behind. Fully merged. |
| `codespace-effective-meme-97q6xg65455v2pr5g` | 0 ahead, 13 behind. Fully merged. |
| `production/adi-jyotish-hardening-20260901-043549` | 0 ahead, 7 behind. Fully merged. |

## Deliberately not merged

| Branch | Why not |
| --- | --- |
| `hotfix-gemini-main` | Its single commit enables `GEMINI_API_KEY` in `apphosting.yaml`. Main deleted that file in 75f825c — "Remove Firebase App Hosting config; Vercel is the real production deploy". Merging it would resurrect dead config for a platform the project left. `GEMINI_API_KEY` belongs in the Vercel project's environment variables instead. Safe to delete. |
| `daily-posts` | **No merge base with main** — an orphan history holding 7 binary marketing assets (`public/daily/*.jpg`, `reel_today.mp4`, `voice_today.wav`) produced by a scheduled bot. Merging needs `--allow-unrelated-histories` and would put regenerated media into the application repo's history forever. Keep it as a separate asset branch, or move the pipeline to object storage. |

## Deleting the dead branches

Branch deletion is not available from the automation that produced this audit —
`git push origin --delete` returns **HTTP 403**, and the GitHub app it runs under
has no `delete_ref` permission. These have to be run by someone with push access,
or clicked in the repository's branch list.

Safe now — each is fully contained in `main`, so deleting loses nothing:

```bash
git push origin --delete codespace-effective-meme-97q6xg65455v2pr5g
git push origin --delete feature/razorpay
git push origin --delete production/adi-jyotish-hardening-20260901-043549
git push origin --delete arena/01a07196-adi-jyotish-saas   # identical content to main (landed as #23)
git push origin --delete arena/01a06ebf-adi-jyotish-saas   # strictly behind main; would remove the privacy feature if merged
git push origin --delete hotfix-gemini-main                # only commit edits apphosting.yaml, deleted in 75f825c
```

**Wait for PR #25 to merge** before deleting these two. Their work is in that pull
request and nowhere else in `main` yet, so deleting them while it is open loses the
work if the PR is ever closed unmerged:

```bash
# only after #25 is merged
git push origin --delete arena/01a079b9-adi-jyotish-saas          # the Supabase migration, 8 commits
git push origin --delete claude/website-saas-conversion-0agq71    # the Gemini downscaling, cherry-picked (so not an ancestor)
```

**Do not delete `daily-posts`.** It has no merge base with `main` and holds the only
copy of seven bot-generated media files (`public/daily/*.jpg`, `reel_today.mp4`,
`voice_today.wav`) across 19 commits. Deleting it destroys them. If the pipeline that
writes it is retired, move the assets to object storage first.

## Follow-ups this audit opened

1. **Rotate the leaked Supabase credentials.** `supabase_keys.env` was committed
   in `dc0ab57` and deleted in `14526c0`. Deleting a file does not remove its
   blob: the `service_role` key is still readable from main's history by anyone
   with repo access, and that key bypasses RLS entirely. Rotate first, then purge
   the blob.
2. ~~**Port the privacy flows to Postgres.**~~ Done. `buildMemberDataExport`,
   `getDeletionBlockers` and `deleteMemberAccount` now route to
   `src/lib/account-deletion-supabase.ts` under cutover, covered by 16 integration
   tests against a real database. The refusal guard is gone.

   Porting it surfaced a worse bug first: six `members` foreign keys inverted the
   retention policy, so an erasure would have destroyed practitioner earnings and
   subscription invoices while leaving birth data behind. Migration `0011` fixes
   that; the port is built on the corrected schema.

   `cosmic_weather` is deliberately absent from both paths. Firestore keys it by
   member; the Postgres table is keyed by `day` with no `member_id` — it is a global
   almanac, so there is nothing member-specific to export or erase.
3. **Test coverage.** ~~165 API routes and 515 source files against 12 unit test
   files.~~ Partly addressed. The merge brought the suite to 57 files, but all 35
   integration suites gate on `SUPABASE_DB_URL && SUPABASE_CUTOVER === "true"`,
   so 443 of their tests self-skipped and never ran anywhere — the ported money
   paths included. CI now runs an `integration` job with a Postgres 16 service
   container and the migration schema applied, which takes the suite from 394
   passing / 443 skipped to **982 passing / 0 skipped**. Both data providers are
   now verified on every PR: `build-and-test` covers the Firestore paths serving
   traffic today (523 of those tests), `integration` covers the Postgres paths
   behind the cutover flag.

   Six API routes now have route-level suites, chosen by one criterion — an
   unauthenticated or destructive action where a dropped check still returns
   200: the Razorpay webhook, account deletion, the owner-bootstrap gate, the
   two invoice payment routes, and administrator invite acceptance. Every one is
   mutation-checked. Still thin: the remaining 159 routes are exercised only
   indirectly, which is breadth rather than exposure.
