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

## Follow-ups this audit opened

1. **Rotate the leaked Supabase credentials.** `supabase_keys.env` was committed
   in `dc0ab57` and deleted in `14526c0`. Deleting a file does not remove its
   blob: the `service_role` key is still readable from main's history by anyone
   with repo access, and that key bypasses RLS entirely. Rotate first, then purge
   the blob.
2. **Port the privacy flows to Postgres.** `buildMemberDataExport`,
   `getDeletionBlockers` and `deleteMemberAccount` in `src/lib/account-deletion.ts`
   are Firestore-only. They now raise `AccountDeletionUnavailableError` under
   cutover rather than half-deleting, but that guard must be replaced with a real
   implementation before `SUPABASE_CUTOVER` is ever set to `true`.
3. **Test coverage.** 165 API routes and 515 source files against 12 unit test
   files. The suite that exists is good; it covers a small share of the surface.
