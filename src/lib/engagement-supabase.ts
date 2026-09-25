import "server-only";

import { query } from "@/lib/postgres";

/**
 * Postgres twins for the member engagement features: daily streaks, the Moon-tagged journal, the
 * cosmic profile card, and the studio's booking milestones. Text timestamp columns (journal and
 * card updated_at) hold ISO strings, as the copy script carried them across.
 */

// --- streaks ------------------------------------------------------------------------------------

export type StreakRow = { currentStreak: number; longestStreak: number; lastActiveDate: string; badges: string[] };

export async function getStreakInSupabase(memberId: string): Promise<StreakRow | null> {
  const { rows } = await query<{ current_streak: number; longest_streak: number; last_active_date: string; badges: string[] }>(
    `select current_streak, longest_streak, last_active_date, badges from public.member_streaks where member_id = $1`,
    [memberId],
  );
  const row = rows[0];
  return row ? { currentStreak: row.current_streak, longestStreak: row.longest_streak, lastActiveDate: row.last_active_date, badges: row.badges ?? [] } : null;
}

export async function saveStreakInSupabase(memberId: string, streak: StreakRow): Promise<void> {
  await query(
    `insert into public.member_streaks (member_id, current_streak, longest_streak, last_active_date, badges, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (member_id) do update set current_streak = excluded.current_streak, longest_streak = excluded.longest_streak,
       last_active_date = excluded.last_active_date, badges = excluded.badges, updated_at = now()`,
    [memberId, streak.currentStreak, streak.longestStreak, streak.lastActiveDate, streak.badges],
  );
}

// --- journal ------------------------------------------------------------------------------------

export type JournalRow = {
  id: string; memberId: string; entryDate: string; mood: string; note: string;
  moonHouse: number | null; moonRashi: string | null; updatedAt: string;
};

/** One entry per member per day: the id is memberId_entryDate, so a second log that day replaces
 * the first, as the Firestore set() did. */
export async function saveJournalEntryInSupabase(entry: JournalRow): Promise<void> {
  await query(
    `insert into public.journal_entries (id, member_id, entry_date, mood, note, moon_house, moon_rashi, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (id) do update set mood = excluded.mood, note = excluded.note, moon_house = excluded.moon_house,
       moon_rashi = excluded.moon_rashi, updated_at = excluded.updated_at`,
    [entry.id, entry.memberId, entry.entryDate, entry.mood, entry.note, entry.moonHouse, entry.moonRashi, entry.updatedAt],
  );
}

export async function listJournalEntriesInSupabase(memberId: string, limit: number): Promise<JournalRow[]> {
  const { rows } = await query<{ id: string; member_id: string; entry_date: string; mood: string; note: string; moon_house: number | null; moon_rashi: string | null; updated_at: string | null }>(
    `select id, member_id, entry_date, mood, note, moon_house, moon_rashi, updated_at
       from public.journal_entries where member_id = $1 order by entry_date desc limit $2`,
    [memberId, limit],
  );
  return rows.map((row) => ({
    id: row.id, memberId: row.member_id, entryDate: row.entry_date, mood: row.mood, note: row.note,
    moonHouse: row.moon_house, moonRashi: row.moon_rashi, updatedAt: row.updated_at ?? new Date().toISOString(),
  }));
}

// --- cosmic profile card ------------------------------------------------------------------------

export type CosmicCardRow = { memberId: string; name: string; sunRashi: string; moonRashi: string; risingRashi: string; lagnaLord: string; blurb: string; updatedAt: string };

export async function saveCosmicCardInSupabase(card: CosmicCardRow): Promise<void> {
  await query(
    `insert into public.cosmic_profile_cards (member_id, name, sun_rashi, moon_rashi, rising_rashi, lagna_lord, blurb, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (member_id) do update set name = excluded.name, sun_rashi = excluded.sun_rashi, moon_rashi = excluded.moon_rashi,
       rising_rashi = excluded.rising_rashi, lagna_lord = excluded.lagna_lord, blurb = excluded.blurb, updated_at = excluded.updated_at`,
    [card.memberId, card.name, card.sunRashi, card.moonRashi, card.risingRashi, card.lagnaLord, card.blurb, card.updatedAt],
  );
}

export async function getCosmicCardInSupabase(memberId: string): Promise<CosmicCardRow | null> {
  const { rows } = await query<{ member_id: string; name: string; sun_rashi: string; moon_rashi: string; rising_rashi: string; lagna_lord: string; blurb: string; updated_at: string | null }>(
    `select member_id, name, sun_rashi, moon_rashi, rising_rashi, lagna_lord, blurb, updated_at from public.cosmic_profile_cards where member_id = $1`,
    [memberId],
  );
  const row = rows[0];
  return row ? {
    memberId: row.member_id, name: row.name, sunRashi: row.sun_rashi, moonRashi: row.moon_rashi, risingRashi: row.rising_rashi,
    lagnaLord: row.lagna_lord, blurb: row.blurb, updatedAt: row.updated_at ?? new Date().toISOString(),
  } : null;
}

// --- studio milestones --------------------------------------------------------------------------

export async function countCompletedBookingsInSupabase(): Promise<number> {
  const { rows } = await query<{ n: number }>(`select count(*)::int as n from public.bookings where status = 'completed'`);
  return rows[0]?.n ?? 0;
}

/** True only for the call that created it: two bookings completing together cannot both claim it. */
export async function claimMilestoneInSupabase(id: string, value: number): Promise<boolean> {
  const result = await query(
    `insert into public.milestones (id, type, value, achieved_at) values ($1, 'bookings', $2, now()) on conflict (id) do nothing`,
    [id, value],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getMilestoneInSupabase(id: string): Promise<{ type: "bookings"; value: number; achievedAt: Date } | null> {
  const { rows } = await query<{ type: "bookings"; value: number; achieved_at: Date }>(
    `select type, value, achieved_at from public.milestones where id = $1`,
    [id],
  );
  return rows[0] ? { type: rows[0].type, value: rows[0].value, achievedAt: new Date(rows[0].achieved_at) } : null;
}
