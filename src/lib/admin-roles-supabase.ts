import "server-only";

import { query, queryModel, queryModels } from "@/lib/postgres";

/**
 * Supabase data access for admin roles. Data access only: validation, permission
 * sanitising and RoleError all stay in admin-roles.ts, so this module never has to
 * import from the module that imports it.
 *
 * `admin_roles.permissions` is jsonb, so Firestore's `array-contains` becomes a
 * containment test against a JSON scalar rather than an array operator.
 */

export type AdminRoleDbRow = {
  id: string;
  slug: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
  adminCount: number;
};

/** Declared in the shape the row arrives as, NOT the shape Postgres returns:
 * `queryModel`/`queryModels` run `rowToCamel` over every row, including a
 * `returning` clause, so `is_system` is already `isSystem` by the time it is read.
 * Reading the snake_case name compiles fine against a loose type and yields
 * undefined, which silently made every role look non-system and deletable. */
type RawRoleRow = { id: string; slug: string; name: string; isSystem: boolean; permissions: unknown };

/** permissions comes back parsed from jsonb; anything that is not an array is treated as empty,
 * matching the Firestore path's `data.permissions ?? []`. */
function permissionsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function toRoleRow(row: RawRoleRow, adminCount: number): AdminRoleDbRow {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    isSystem: row.isSystem,
    permissions: permissionsOf(row.permissions),
    adminCount,
  };
}

export async function getAllRolesInSupabase(): Promise<AdminRoleDbRow[]> {
  // One pass instead of two queries plus an in-memory tally. Roles with no admins
  // still appear, so the count has to be a left join rather than a group by over
  // admin_users.
  const rows = await queryModels<RawRoleRow & { adminCount: number }>(
    `select r.id, r.slug, r.name, r.is_system, r.permissions,
            count(u.id)::int as admin_count
       from public.admin_roles r
       left join public.admin_users u on u.role = r.id
      group by r.id, r.slug, r.name, r.is_system, r.permissions
      order by r.id`,
  );
  return rows.map((row) => toRoleRow(row, row.adminCount));
}

export async function getRoleInSupabase(slug: string): Promise<AdminRoleDbRow | null> {
  const row = await queryModel<RawRoleRow>(
    `select id, slug, name, is_system, permissions from public.admin_roles where id = $1`,
    [slug],
  );
  if (!row) return null;
  const { rows } = await query<{ n: number }>(
    `select count(*)::int as n from public.admin_users where role = $1`,
    [slug],
  );
  return toRoleRow(row, rows[0]?.n ?? 0);
}

export async function countAdminsWithRoleInSupabase(slug: string): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `select count(*)::int as n from public.admin_users where role = $1`,
    [slug],
  );
  return rows[0]?.n ?? 0;
}

/**
 * Returns false when the slug is already taken.
 *
 * Firestore did a get-then-set, which two concurrent creates could both pass; the
 * primary key closes that, so the caller turns false into "already exists" rather
 * than racing a read.
 */
export async function insertRoleInSupabase(input: {
  slug: string;
  name: string;
  permissions: string[];
}): Promise<boolean> {
  const result = await query(
    `insert into public.admin_roles (id, slug, name, is_system, permissions, created_at, updated_at)
     values ($1, $1, $2, false, $3::jsonb, now(), now())
     on conflict (id) do nothing`,
    [input.slug, input.name, JSON.stringify(input.permissions)],
  );
  return result.rowCount === 1;
}

export async function updateRoleInSupabase(
  slug: string,
  patch: { name?: string; permissions?: string[] },
): Promise<AdminRoleDbRow | null> {
  // One statement with a coalesce per column, so a patch that only renames cannot
  // blank the permissions. `returning` gives back the post-update row.
  const row = await queryModel<RawRoleRow>(
    `update public.admin_roles
        set name = coalesce($2, name),
            permissions = coalesce($3::jsonb, permissions),
            updated_at = now()
      where id = $1
      returning id, slug, name, is_system, permissions`,
    [slug, patch.name ?? null, patch.permissions ? JSON.stringify(patch.permissions) : null],
  );
  if (!row) return null;
  const adminCount = await countAdminsWithRoleInSupabase(slug);
  return toRoleRow(row, adminCount);
}

/**
 * Deletes the role only if no admin still holds it, and returns why it refused
 * otherwise. Counting and then deleting in two statements would let a concurrent
 * team update assign the role in between, leaving an admin pointing at a role that
 * no longer exists — so the check is part of the delete's own predicate.
 */
export async function deleteRoleInSupabase(
  slug: string,
): Promise<{ kind: "deleted" } | { kind: "not_found" } | { kind: "in_use"; count: number }> {
  const { rows } = await query<{ id: string }>(
    `delete from public.admin_roles r
      where r.id = $1
        and not exists (select 1 from public.admin_users u where u.role = r.id)
      returning r.id`,
    [slug],
  );
  if (rows.length === 1) return { kind: "deleted" };

  const count = await countAdminsWithRoleInSupabase(slug);
  if (count > 0) return { kind: "in_use", count };
  return { kind: "not_found" };
}

export async function listRoleSlugsInSupabase(): Promise<Array<{ slug: string; name: string }>> {
  return queryModels<{ slug: string; name: string }>(
    `select id as slug, name from public.admin_roles order by id`,
  );
}

export async function roleSlugExistsInSupabase(slug: string): Promise<boolean> {
  const { rows } = await query<{ found: boolean }>(
    `select exists(select 1 from public.admin_roles where id = $1) as found`,
    [slug],
  );
  return rows[0]?.found ?? false;
}

/**
 * Active admin ids whose role grants the permission.
 *
 * Firestore capped an `in` filter at 30 values and sliced the role list; Postgres
 * has no such limit, so the join takes every matching role. The 30-value slice was
 * a correctness bug that only stayed invisible while role counts stayed small.
 */
export async function getAdminIdsWithPermissionInSupabase(permission: string): Promise<string[]> {
  const rows = await queryModels<{ id: string }>(
    `select u.id
       from public.admin_users u
       join public.admin_roles r on r.id = u.role
      where u.active
        and r.permissions @> to_jsonb($1::text)
      order by u.id`,
    [permission],
  );
  return rows.map((row) => row.id);
}

/**
 * Upserts a built-in system role — the first-run bootstrap installs `owner` this way,
 * mirroring the Firestore `set(..., { merge: true })`.
 *
 * `is_system` is forced true on both paths: the owner role must stay system-flagged
 * whatever was in the row before, because that flag is what keeps it out of the
 * editable role list.
 */
export async function upsertSystemRoleInSupabase(slug: string, name: string, permissions: string[]): Promise<void> {
  await query(
    `insert into public.admin_roles (id, slug, name, is_system, permissions, created_at, updated_at)
     values ($1, $1, $2, true, $3::jsonb, now(), now())
     on conflict (id) do update
        set name = excluded.name,
            is_system = true,
            permissions = excluded.permissions,
            updated_at = now()`,
    [slug, name, JSON.stringify(permissions)],
  );
}
