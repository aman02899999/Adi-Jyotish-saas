import "server-only";

import { randomUUID } from "node:crypto";

import { query } from "@/lib/postgres";

/**
 * Postgres twins for the saved compatibility matches and numerology readings.
 *
 * kundli_matches carries two sets of name/birth columns: name_a… from the original schema and
 * person_a_name… that the Firestore copy fills (its fields are personAName…). New rows write both;
 * reads prefer person_a_* and fall back, so copied and new rows read the same.
 */

export type StoredKundliMatch = {
  id: string;
  memberId: string | null;
  personAName: string; personABirthDate: string; personABirthTime: string; personABirthPlace: string;
  personBName: string; personBBirthDate: string; personBBirthTime: string; personBBirthPlace: string;
  compatibilityScore: number;
  narrative: string;
  timeline: unknown;
};

export async function insertKundliMatchInSupabase(match: Omit<StoredKundliMatch, "id"> & { breakdown: unknown }): Promise<string> {
  const id = randomUUID();
  await query(
    `insert into public.kundli_matches
       (id, member_id, name_a, birth_date_a, birth_time_a, birth_place_a, name_b, birth_date_b, birth_time_b, birth_place_b,
        person_a_name, person_a_birth_date, person_a_birth_time, person_a_birth_place,
        person_b_name, person_b_birth_date, person_b_birth_time, person_b_birth_place,
        compatibility_score, breakdown, narrative, timeline)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id, match.memberId,
      match.personAName, match.personABirthDate, match.personABirthTime, match.personABirthPlace,
      match.personBName, match.personBBirthDate, match.personBBirthTime, match.personBBirthPlace,
      match.compatibilityScore, JSON.stringify(match.breakdown), match.narrative, JSON.stringify(match.timeline),
    ],
  );
  return id;
}

export async function getKundliMatchInSupabase(id: string): Promise<StoredKundliMatch | null> {
  const { rows } = await query<Record<string, unknown>>(
    `select id, member_id,
            coalesce(person_a_name, name_a) as a_name, coalesce(person_a_birth_date, birth_date_a) as a_date,
            coalesce(person_a_birth_time, birth_time_a) as a_time, coalesce(person_a_birth_place, birth_place_a) as a_place,
            coalesce(person_b_name, name_b) as b_name, coalesce(person_b_birth_date, birth_date_b) as b_date,
            coalesce(person_b_birth_time, birth_time_b) as b_time, coalesce(person_b_birth_place, birth_place_b) as b_place,
            compatibility_score, narrative, timeline
       from public.kundli_matches where id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    memberId: (row.member_id as string | null) ?? null,
    personAName: row.a_name as string, personABirthDate: row.a_date as string, personABirthTime: row.a_time as string, personABirthPlace: row.a_place as string,
    personBName: row.b_name as string, personBBirthDate: row.b_date as string, personBBirthTime: row.b_time as string, personBBirthPlace: row.b_place as string,
    // numeric(6,2) arrives as a string.
    compatibilityScore: Number(row.compatibility_score),
    narrative: row.narrative as string,
    timeline: row.timeline ?? [],
  };
}

export async function insertNumerologyReadingInSupabase(reading: {
  memberId: string | null; name: string; birthDate: string; lifePathNumber: number; destinyNumber: number; narrative: string;
}): Promise<string> {
  const id = randomUUID();
  await query(
    `insert into public.numerology_readings (id, member_id, name, birth_date, life_path_number, destiny_number, narrative)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, reading.memberId, reading.name, reading.birthDate, reading.lifePathNumber, reading.destinyNumber, reading.narrative],
  );
  return id;
}
