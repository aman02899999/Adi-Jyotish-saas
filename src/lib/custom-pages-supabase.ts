import "server-only";

import { randomUUID } from "node:crypto";

import { query } from "@/lib/postgres";

/**
 * Postgres twin for admin-built custom pages. custom_pages.slug is unique, so a clash on create is
 * detected by the insert itself rather than by a read beforehand, which two concurrent creates of
 * the same title could both pass.
 */

export type CustomPageRow = {
  id: string; slug: string; title: string; metaDescription: string;
  blocks: unknown[]; published: boolean; createdAt: Date; updatedAt: Date;
};

const COLUMNS = `id, slug, title, meta_description, blocks, published, created_at, updated_at`;

type Raw = { id: string; slug: string; title: string; meta_description: string; blocks: unknown[]; published: boolean; created_at: Date; updated_at: Date };

function fromRow(row: Raw): CustomPageRow {
  return {
    id: row.id, slug: row.slug, title: row.title, metaDescription: row.meta_description ?? "",
    blocks: row.blocks ?? [], published: row.published, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
  };
}

export async function listCustomPagesInSupabase(publishedOnly: boolean): Promise<CustomPageRow[]> {
  const { rows } = await query<Raw>(`select ${COLUMNS} from public.custom_pages ${publishedOnly ? "where published" : ""} order by created_at desc`);
  return rows.map(fromRow);
}

export async function getCustomPageInSupabase(by: { id: string } | { publishedSlug: string }): Promise<CustomPageRow | null> {
  const { rows } = "id" in by
    ? await query<Raw>(`select ${COLUMNS} from public.custom_pages where id = $1`, [by.id])
    : await query<Raw>(`select ${COLUMNS} from public.custom_pages where slug = $1 and published`, [by.publishedSlug]);
  return rows[0] ? fromRow(rows[0]) : null;
}

/** Inserts under the first free slug from `candidates`; null when every candidate is taken. */
export async function insertCustomPageInSupabase(input: { title: string; metaDescription: string }, candidates: string[]): Promise<CustomPageRow | null> {
  for (const slug of candidates) {
    const { rows } = await query<Raw>(
      `insert into public.custom_pages (id, slug, title, meta_description) values ($1, $2, $3, $4)
       on conflict (slug) do nothing returning ${COLUMNS}`,
      [randomUUID(), slug, input.title, input.metaDescription],
    );
    if (rows[0]) return fromRow(rows[0]);
  }
  return null;
}

export async function updateCustomPageInSupabase(
  id: string,
  patch: Partial<{ title: string; metaDescription: string; blocks: unknown[]; published: boolean }>,
): Promise<CustomPageRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [id];
  const add = (column: string, value: unknown) => { values.push(value); sets.push(`${column} = $${values.length}`); };
  if (patch.title !== undefined) add("title", patch.title);
  if (patch.metaDescription !== undefined) add("meta_description", patch.metaDescription);
  if (patch.blocks !== undefined) add("blocks", JSON.stringify(patch.blocks));
  if (patch.published !== undefined) add("published", patch.published);
  const { rows } = await query<Raw>(
    `update public.custom_pages set ${[...sets, "updated_at = now()"].join(", ")} where id = $1 returning ${COLUMNS}`,
    values,
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function deleteCustomPageInSupabase(id: string): Promise<boolean> {
  const { rowCount } = await query(`delete from public.custom_pages where id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
