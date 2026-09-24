import "server-only";

import { query, withTransaction } from "@/lib/postgres";

/**
 * Postgres twin of members/{memberId}/favorites/{practitionerId}. The copy script keys each row
 * `${memberId}_${practitionerId}`; unique (member_id, practitioner_id) is what actually enforces
 * one favourite per pair, so a concurrent double-tap cannot insert two.
 */

export async function listFavoritePractitionerIdsInSupabase(memberId: string): Promise<string[]> {
  const { rows } = await query<{ practitioner_id: string }>(
    `select practitioner_id from public.member_favorites where member_id = $1 order by created_at desc`,
    [memberId],
  );
  return rows.map((row) => row.practitioner_id);
}

/** Adds the favourite, or removes it if it was there. Returns whether it is now a favourite. */
export async function toggleFavoriteInSupabase(memberId: string, practitionerId: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const removed = await client.query(
      `delete from public.member_favorites where member_id = $1 and practitioner_id = $2`,
      [memberId, practitionerId],
    );
    if (removed.rowCount) return false;
    await client.query(
      `insert into public.member_favorites (id, member_id, practitioner_id) values ($3, $1, $2)
       on conflict (member_id, practitioner_id) do nothing`,
      [memberId, practitionerId, `${memberId}_${practitionerId}`],
    );
    return true;
  });
}
