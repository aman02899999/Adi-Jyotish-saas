import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * Streaks, the journal, the cosmic profile card and studio milestones on Postgres, through the
 * app's own modules with the cutover on. All four wrote Firestore unconditionally; milestones
 * additionally could not be stored at all until migration 0013, because the table demanded a
 * member for what is a studio-wide record. Needs a migrated database and SUPABASE_CUTOVER=true.
 */
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));

const { recordDailyVisit } = await import("@/lib/streaks");
const { logJournalEntry, listJournalEntries } = await import("@/lib/astro-journal");
const { upsertCosmicProfileCard, getCosmicProfileCard } = await import("@/lib/cosmic-profile-card");
const { checkBookingCompletionMilestone, getMilestone } = await import("@/lib/milestones");
const { claimMilestoneInSupabase } = await import("@/lib/engagement-supabase");

const MEMBER = "engage_itest_member";
const IST = 5.5 * 3_600_000;
const istDate = (daysAgo: number) => new Date(Date.now() + IST - daysAgo * 86_400_000).toISOString().slice(0, 10);
const birth = { name: "Asha", birthDate: "1990-05-17", birthTime: "04:45", birthPlace: "Jaipur, India" };

async function cleanup() {
  await query(`delete from public.member_streaks where member_id = $1`, [MEMBER]);
  await query(`delete from public.journal_entries where member_id = $1`, [MEMBER]);
  await query(`delete from public.cosmic_profile_cards where member_id = $1`, [MEMBER]);
  await query(`delete from public.milestones where id like 'itest-%'`);
  await query(`delete from public.members where id = $1`, [MEMBER]);
}

describeCutover("member engagement on Postgres", () => {
  beforeEach(async () => {
    await cleanup();
    await query(`insert into public.members (id, name, email) values ($1, 'Asha', 'engage-itest@example.test')`, [MEMBER]);
  });
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  describe("streaks", () => {
    it("starts at one, and counts a second visit the same day once", async () => {
      expect(await recordDailyVisit(MEMBER)).toMatchObject({ currentStreak: 1, longestStreak: 1 });
      expect(await recordDailyVisit(MEMBER)).toMatchObject({ currentStreak: 1, justEarned: null });
    });

    it("extends from yesterday and awards the three-day badge", async () => {
      await query(`insert into public.member_streaks (member_id, current_streak, longest_streak, last_active_date, badges) values ($1, 2, 5, $2, '{}')`, [MEMBER, istDate(1)]);
      expect(await recordDailyVisit(MEMBER)).toMatchObject({ currentStreak: 3, longestStreak: 5, justEarned: "spark" });
    });

    it("resets after a missed day but keeps the longest", async () => {
      await query(`insert into public.member_streaks (member_id, current_streak, longest_streak, last_active_date, badges) values ($1, 9, 9, $2, '{spark,week}')`, [MEMBER, istDate(3)]);
      expect(await recordDailyVisit(MEMBER)).toMatchObject({ currentStreak: 1, longestStreak: 9 });
    });
  });

  describe("journal", () => {
    it("keeps one entry per day, the latest", async () => {
      await logJournalEntry({ memberId: MEMBER, member: birth, mood: "low", note: "first" });
      const second = await logJournalEntry({ memberId: MEMBER, member: birth, mood: "great", note: "second" });

      const entries = await listJournalEntries(MEMBER);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ id: second.id, mood: "great", note: "second", entryDate: istDate(0) });
      expect(entries[0].moonHouse).toBeGreaterThanOrEqual(1);
    });

    it("lists newest day first, up to the limit", async () => {
      for (const [daysAgo, mood] of [[2, "low"], [1, "good"]] as const) {
        await query(`insert into public.journal_entries (id, member_id, entry_date, mood, note) values ($1, $2, $3, $4, '')`, [`${MEMBER}_${istDate(daysAgo)}`, MEMBER, istDate(daysAgo), mood]);
      }
      await logJournalEntry({ memberId: MEMBER, member: birth, mood: "neutral", note: "" });
      expect((await listJournalEntries(MEMBER, 2)).map((e) => e.mood)).toEqual(["neutral", "good"]);
    });
  });

  describe("cosmic profile card", () => {
    it("stores one card per member and returns the latest", async () => {
      await upsertCosmicProfileCard({ memberId: MEMBER, ...birth });
      const card = await upsertCosmicProfileCard({ memberId: MEMBER, ...birth, name: "Asha R" });
      expect(await getCosmicProfileCard(MEMBER)).toMatchObject({ name: "Asha R", sunRashi: card.sunRashi, lagnaLord: card.lagnaLord });
      const { rows } = await query(`select 1 from public.cosmic_profile_cards where member_id = $1`, [MEMBER]);
      expect(rows).toHaveLength(1);
    });
  });

  describe("studio milestones", () => {
    it("stores a studio-wide milestone with no member (migration 0013) and reads it back", async () => {
      expect(await claimMilestoneInSupabase("itest-bookings-500", 500)).toBe(true);
      expect(await getMilestone("itest-bookings-500")).toMatchObject({ id: "itest-bookings-500", type: "bookings", value: 500 });
    });

    it("lets exactly one of several simultaneous completions claim a milestone", async () => {
      const claims = await Promise.all(Array.from({ length: 5 }, () => claimMilestoneInSupabase("itest-bookings-1000", 1000)));
      expect(claims.filter(Boolean)).toHaveLength(1);
    });

    it("claims nothing when the completed count is not a milestone", async () => {
      const { rows } = await query<{ n: number }>(`select count(*)::int as n from public.bookings where status = 'completed'`);
      if (![100, 250, 500, 1000, 2500, 5000, 10000].includes(rows[0].n)) expect(await checkBookingCompletionMilestone()).toBeNull();
    });
  });
});
