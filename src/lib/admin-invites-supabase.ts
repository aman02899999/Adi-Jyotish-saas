import "server-only";

import { query, queryModel, queryModels } from "@/lib/postgres";

/**
 * Supabase data access for administrator invitations.
 *
 * `id` is supplied by the caller: Firestore's `collection.add()` generated the document
 * id, and `admin_invites.id` is a primary key with no default, so omitting it would fail
 * with 23502 rather than inventing one.
 */

export type AdminInviteRow = {
  id: string;
  email: string;
  role: string;
  invitedBy: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

const INVITE_COLUMNS = `id, email::text as email, role, invited_by, expires_at, accepted_at, created_at`;

/** Unaccepted, unexpired invitations, oldest first. */
export async function listPendingAdminInvitesInSupabase(): Promise<AdminInviteRow[]> {
  return queryModels<AdminInviteRow>(
    `select ${INVITE_COLUMNS} from public.admin_invites
      where accepted_at is null and expires_at > now()
      order by created_at asc`,
  );
}

/** Discards every invitation for this email — accepted ones included, which is what the
 * Firestore batch delete did — so an email never carries two live links at once. */
export async function deleteAdminInvitesByEmailInSupabase(email: string): Promise<number> {
  const result = await query(`delete from public.admin_invites where email = $1`, [email]);
  return result.rowCount ?? 0;
}

export async function insertAdminInviteInSupabase(input: {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `insert into public.admin_invites (id, email, role, invited_by, token_hash, expires_at, accepted_at, created_at)
     values ($1, $2, $3, $4, $5, $6, null, now())`,
    [input.id, input.email, input.role, input.invitedBy, input.tokenHash, input.expiresAt],
  );
}

/** Looks up a live invitation by token hash, or null when it is missing, already
 * accepted, or expired. Expiry is folded into the predicate rather than checked after
 * the row comes back. */
export async function findAdminInviteByTokenHashInSupabase(tokenHash: string): Promise<AdminInviteRow | null> {
  return queryModel<AdminInviteRow>(
    `select ${INVITE_COLUMNS} from public.admin_invites
      where token_hash = $1 and accepted_at is null and expires_at > now()
      limit 1`,
    [tokenHash],
  );
}

/** Records acceptance. Guarded so a second acceptance of the same invitation cannot
 * overwrite the first timestamp. */
export async function markAdminInviteAcceptedInSupabase(id: string): Promise<boolean> {
  const result = await query(
    `update public.admin_invites set accepted_at = now() where id = $1 and accepted_at is null`,
    [id],
  );
  return (result.rowCount ?? 0) === 1;
}
