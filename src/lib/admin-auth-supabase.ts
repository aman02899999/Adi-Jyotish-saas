import "server-only";

import { randomUUID } from "node:crypto";

import { query, queryModel } from "@/lib/postgres";

/**
 * Supabase data access for the admin session and audit trail.
 *
 * The `active` filter is folded into the query rather than checked afterwards:
 * admin_users.active is the sign-in gate, and a column that was missing from the
 * schema until migration 0010. Reading it as a separate step would be correct but
 * gives the next reader a chance to drop it.
 *
 * email is citext, so it is cast to text on the way out.
 */

export type ActiveAdminRow = { name: string; email: string; role: string };

export async function countAdminsInSupabase(): Promise<number> {
  const { rows } = await query<{ n: number }>(`select count(*)::int as n from public.admin_users`);
  return rows[0]?.n ?? 0;
}

export async function touchAdminLastLoginInSupabase(uid: string): Promise<void> {
  await query(`update public.admin_users set last_login_at = now() where id = $1`, [uid]);
}

/** The admin's profile, or null when there is none OR the account is deactivated. */
export async function getActiveAdminInSupabase(uid: string): Promise<ActiveAdminRow | null> {
  return queryModel<ActiveAdminRow>(
    `select name, email::text as email, role from public.admin_users where id = $1 and active`,
    [uid],
  );
}

export type AuditLogInsert = {
  /** Null for entries raised by a member rather than an administrator. */
  adminId: string | null;
  adminName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
};

export async function insertAuditLogInSupabase(input: AuditLogInsert): Promise<void> {
  // The id is generated here: audit_logs.id has no default because copied rows carry
  // their verbatim Firestore document id, and the Firestore path used .add().
  await query(
    `insert into public.audit_logs (id, admin_id, admin_name, action, entity_type, entity_id, details, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())`,
    [randomUUID(), input.adminId, input.adminName, input.action, input.entityType, input.entityId, input.details],
  );
}

/**
 * Creates an administrator row — first-run bootstrap and accepted invitations.
 *
 * `stampLogin` records `last_login_at`: the bootstrap route signs the new owner
 * straight in, while an accepted invite does not (the admin has no session yet and
 * has never logged in).
 *
 * Untargeted `on conflict do nothing` because `admin_users` carries a unique index on
 * `email` as well as the primary key, and an `(id)` arbiter would surface a
 * same-email collision as an unhandled 23505. Returns whether this call created it.
 */
export async function createAdminInSupabase(input: {
  id: string;
  name: string;
  email: string;
  role: string;
  stampLogin: boolean;
}): Promise<boolean> {
  const result = await query(
    `insert into public.admin_users (id, name, email, role, active, created_at, updated_at, last_login_at)
     values ($1, $2, $3, $4, true, now(), now(), case when $5::boolean then now() else null end)
     on conflict do nothing`,
    [input.id, input.name, input.email, input.role, input.stampLogin],
  );
  return (result.rowCount ?? 0) === 1;
}
