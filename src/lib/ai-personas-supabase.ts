import "server-only";

import { query, queryModel, queryModels } from "@/lib/postgres";

/**
 * Supabase data access for AI personas. Data access only — validation, slug
 * generation and AiPersonaError stay in ai-personas.ts.
 *
 * price is numeric(14,2), so node-postgres returns it as a string; it is listed in
 * NUMERIC so it arrives as a number. sample_questions is text[], which the driver
 * already parses into a JS array.
 */

const COLUMNS = `id, slug, name, title, avatar_url, description, system_prompt,
         sample_questions, price, currency, active, created_at, updated_at`;

const NUMERIC = ["price"];

export type AiPersonaDbRow = {
  id: string;
  slug: string;
  name: string;
  title: string;
  avatarUrl: string | null;
  description: string;
  systemPrompt: string;
  sampleQuestions: string[];
  price: number;
  currency: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AiPersonaInsert = {
  slug: string;
  name: string;
  title: string;
  avatarUrl: string | null;
  description: string;
  systemPrompt: string;
  sampleQuestions: string[];
  price: number;
  currency: string;
  active: boolean;
};

export async function getAllPersonasInSupabase(): Promise<AiPersonaDbRow[]> {
  return queryModels<AiPersonaDbRow>(`select ${COLUMNS} from public.ai_personas order by created_at desc, id desc`, [], NUMERIC);
}

export async function getActivePersonasInSupabase(): Promise<AiPersonaDbRow[]> {
  return queryModels<AiPersonaDbRow>(`select ${COLUMNS} from public.ai_personas where active order by id`, [], NUMERIC);
}

export async function getPersonaBySlugInSupabase(slug: string): Promise<AiPersonaDbRow | null> {
  return queryModel<AiPersonaDbRow>(`select ${COLUMNS} from public.ai_personas where slug = $1`, [slug], NUMERIC);
}

export async function getPersonaByIdInSupabase(id: string): Promise<AiPersonaDbRow | null> {
  return queryModel<AiPersonaDbRow>(`select ${COLUMNS} from public.ai_personas where id = $1`, [id], NUMERIC);
}

export async function personaIdExistsInSupabase(id: string): Promise<boolean> {
  const { rows } = await query<{ found: boolean }>(
    `select exists(select 1 from public.ai_personas where id = $1) as found`,
    [id],
  );
  return rows[0]?.found ?? false;
}

/** The document id and the slug are the same value, so both columns take it. */
export async function insertPersonaInSupabase(values: AiPersonaInsert): Promise<AiPersonaDbRow | null> {
  return queryModel<AiPersonaDbRow>(
    `insert into public.ai_personas
       (id, slug, name, title, avatar_url, description, system_prompt, sample_questions, price, currency, active, created_at, updated_at)
     values ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
     returning ${COLUMNS}`,
    [
      values.slug, values.name, values.title, values.avatarUrl, values.description,
      values.systemPrompt, values.sampleQuestions, values.price, values.currency, values.active,
    ],
    NUMERIC,
  );
}

export async function updatePersonaInSupabase(
  id: string,
  patch: Partial<AiPersonaInsert>,
): Promise<AiPersonaDbRow | null> {
  // One coalesce per column, so a patch that only renames cannot blank the prompt.
  return queryModel<AiPersonaDbRow>(
    `update public.ai_personas
        set name = coalesce($2, name),
            title = coalesce($3, title),
            avatar_url = case when $11 then $4 else avatar_url end,
            description = coalesce($5, description),
            system_prompt = coalesce($6, system_prompt),
            sample_questions = coalesce($7, sample_questions),
            price = coalesce($8, price),
            currency = coalesce($9, currency),
            active = coalesce($10, active),
            updated_at = now()
      where id = $1
      returning ${COLUMNS}`,
    [
      id,
      patch.name ?? null,
      patch.title ?? null,
      patch.avatarUrl ?? null,
      patch.description ?? null,
      patch.systemPrompt ?? null,
      patch.sampleQuestions ?? null,
      patch.price ?? null,
      patch.currency ?? null,
      patch.active ?? null,
      // avatar_url is the one nullable field, so coalesce cannot tell "not in the
      // patch" from "explicitly cleared" — a flag carries that instead.
      patch.avatarUrl !== undefined,
    ],
    NUMERIC,
  );
}

export type PersonaDeleteOutcome =
  | { kind: "deleted" }
  | { kind: "not_found" }
  | { kind: "in_use" };

/**
 * Deletes only if no reading references the persona.
 *
 * The check is in the delete's own predicate rather than a separate query: a paid
 * reading created between the check and the delete would otherwise leave a reading
 * pointing at a persona that no longer exists. ai_readings.persona_id is also a
 * foreign key, so the database would refuse it anyway — this reports why instead.
 */
export async function deletePersonaInSupabase(id: string): Promise<PersonaDeleteOutcome> {
  const { rows } = await query<{ id: string }>(
    `delete from public.ai_personas p
      where p.id = $1
        and not exists (select 1 from public.ai_readings r where r.persona_id = p.id)
      returning p.id`,
    [id],
  );
  if (rows.length === 1) return { kind: "deleted" };

  const existing = await personaIdExistsInSupabase(id);
  return existing ? { kind: "in_use" } : { kind: "not_found" };
}
