import "server-only";

import { randomUUID } from "node:crypto";
import { query, withTransaction } from "@/lib/postgres";

/**
 * Postgres twin of members/{memberId}/familyMembers. created_at is a text column (the copy script
 * carried Firestore's ISO strings across), so it is written as an ISO string too and sorts the
 * same way.
 */

export type FamilyMemberRow = {
  id: string;
  memberId: string;
  name: string;
  relationship: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  createdAt: string | null;
};

type SqlRow = { id: string; member_id: string; name: string; relationship: string; birth_date: string | null; birth_time: string | null; birth_place: string | null; created_at: string | null };

const fromRow = (row: SqlRow): FamilyMemberRow => ({
  id: row.id,
  memberId: row.member_id,
  name: row.name,
  relationship: row.relationship ?? "",
  birthDate: row.birth_date ?? "",
  birthTime: row.birth_time ?? "",
  birthPlace: row.birth_place ?? "",
  createdAt: row.created_at,
});

export async function listFamilyMembersInSupabase(memberId: string): Promise<FamilyMemberRow[]> {
  const { rows } = await query<SqlRow>(
    `select id, member_id, name, relationship, birth_date, birth_time, birth_place, created_at
       from public.family_members where member_id = $1 order by created_at asc nulls first, id asc`,
    [memberId],
  );
  return rows.map(fromRow);
}

/**
 * Adds one, unless the member already has `max`. The member row is locked first, so two
 * concurrent adds cannot both count eleven and both insert — the same guarantee the Firestore
 * transaction gave. Null when the cap is reached.
 */
export async function addFamilyMemberInSupabase(
  input: Omit<FamilyMemberRow, "id" | "createdAt">,
  max: number,
): Promise<FamilyMemberRow | null> {
  return withTransaction(async (client) => {
    await client.query(`select 1 from public.members where id = $1 for update`, [input.memberId]);
    const count = await client.query<{ n: number }>(`select count(*)::int as n from public.family_members where member_id = $1`, [input.memberId]);
    if ((count.rows[0]?.n ?? 0) >= max) return null;
    const { rows } = await client.query<SqlRow>(
      `insert into public.family_members (id, member_id, name, relationship, birth_date, birth_time, birth_place, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, member_id, name, relationship, birth_date, birth_time, birth_place, created_at`,
      [randomUUID(), input.memberId, input.name, input.relationship, input.birthDate, input.birthTime, input.birthPlace, new Date().toISOString()],
    );
    return fromRow(rows[0]);
  });
}

/** Scoped to the owner: a member can only delete their own family entries. */
export async function deleteFamilyMemberInSupabase(memberId: string, familyMemberId: string): Promise<void> {
  await query(`delete from public.family_members where id = $1 and member_id = $2`, [familyMemberId, memberId]);
}
