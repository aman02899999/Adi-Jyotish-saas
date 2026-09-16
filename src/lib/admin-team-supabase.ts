import "server-only";

import { query, queryModel, queryModels } from "@/lib/postgres";

/**
 * Supabase data access for the administrator team screen: listing, updating and
 * deleting admin accounts.
 *
 * The "keep at least one active owner" rule is a COUNT over rows the update does not
 * otherwise touch, so a row lock on the target is not enough to make it safe. Both
 * callers here check the count before mutating; see the route for why that is
 * acceptable and what would be needed to make it airtight.
 */

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

const ADMIN_COLUMNS =
  `id, name, email::text as email, role, active, last_login_at, created_at`;

/** Every administrator, by name — the Firestore path sorted in Node, and so does this,
 * because Postgres text ordering is collation-dependent and the UI expects the same
 * order it has always shown. */
export async function listAdminUsersInSupabase(): Promise<AdminUserRow[]> {
  return queryModels<AdminUserRow>(
    `select ${ADMIN_COLUMNS} from public.admin_users order by name asc`,
  );
}

export async function getAdminUserInSupabase(id: string): Promise<AdminUserRow | null> {
  return queryModel<AdminUserRow>(
    `select ${ADMIN_COLUMNS} from public.admin_users where id = $1`,
    [id],
  );
}

/** Whether an administrator row already exists for this email. `email` is citext, so
 * the match is case-insensitive without lowercasing the input. */
export async function adminUserExistsWithEmailInSupabase(email: string): Promise<boolean> {
  const result = await query(
    `select 1 from public.admin_users where email = $1 limit 1`,
    [email],
  );
  return result.rows.length > 0;
}

export async function countActiveOwnersInSupabase(): Promise<number> {
  const result = await query<{ n: number }>(
    `select count(*)::int as n from public.admin_users where role = 'owner' and active`,
  );
  return result.rows[0]?.n ?? 0;
}

export async function updateAdminUserInSupabase(
  id: string,
  input: { role: string; active: boolean },
): Promise<boolean> {
  const result = await query(
    `update public.admin_users set role = $2, active = $3, updated_at = now() where id = $1`,
    [id, input.role, input.active],
  );
  return (result.rowCount ?? 0) === 1;
}

export async function deleteAdminUserInSupabase(id: string): Promise<boolean> {
  const result = await query(`delete from public.admin_users where id = $1`, [id]);
  return (result.rowCount ?? 0) === 1;
}
