import "server-only";

import { query, withTransaction } from "@/lib/postgres";

/**
 * Postgres twins for two computed caches: horoscope readings (daily_horoscopes, keyed by the id
 * horoscopes.ts builds) and each member's last-seen transit houses (cosmic_weather.houses, keyed
 * by member id), which is what lets the dashboard notice a transit changing house.
 */

/** The cached reading for this id, creating it with `content` if there is none. The first writer
 * wins, as Firestore's create() did, so concurrent first requests all get the same text. */
export async function readOrCreateHoroscopeInSupabase(
  id: string, sign: string, date: string, content: string,
): Promise<{ content: string; createdAt: Date }> {
  await query(
    `insert into public.daily_horoscopes (id, sign, date, content) values ($1, $2, $3, $4) on conflict (id) do nothing`,
    [id, sign, date, content],
  );
  const { rows } = await query<{ content: string; created_at: Date }>(`select content, created_at from public.daily_horoscopes where id = $1`, [id]);
  return { content: rows[0].content, createdAt: new Date(rows[0].created_at) };
}

export type TransitHouses = { moon?: number; jupiter?: number; saturn?: number; rahu?: number; ketu?: number };

/**
 * Compares today's houses with the stored ones and stores today's, under a row lock, so two
 * concurrent dashboard loads cannot both see the pre-change state and both notify. Returns the
 * houses as they were before this call.
 */
export async function swapTransitHousesInSupabase(memberId: string, today: Required<TransitHouses>): Promise<TransitHouses> {
  return withTransaction(async (client) => {
    await client.query(`insert into public.cosmic_weather (id) values ($1) on conflict (id) do nothing`, [memberId]);
    const { rows } = await client.query<{ houses: TransitHouses | null }>(`select houses from public.cosmic_weather where id = $1 for update`, [memberId]);
    const previous = rows[0]?.houses ?? {};
    const unchanged = (["moon", "jupiter", "saturn", "rahu", "ketu"] as const).every((graha) => previous[graha] === today[graha]);
    if (!unchanged) {
      await client.query(`update public.cosmic_weather set houses = $2, updated_at = now() where id = $1`, [memberId, JSON.stringify(today)]);
    }
    return previous;
  });
}
