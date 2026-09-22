import "server-only";

import { query, queryModel } from "@/lib/postgres";

/** Supabase data access for practitioner invitations. See admin-invites-supabase.ts for
 * why `id` is supplied by the caller. */

export type PractitionerInviteRow = {
  id: string;
  email: string;
  practitionerSlug: string;
  invitedBy: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

const INVITE_COLUMNS =
  `id, email::text as email, practitioner_slug, invited_by, expires_at, accepted_at, created_at`;

/** Discards the practitioner's outstanding invitations, so only the newest link works. */
export async function deletePendingPractitionerInvitesInSupabase(practitionerSlug: string): Promise<number> {
  const result = await query(
    `delete from public.practitioner_invites where practitioner_slug = $1 and accepted_at is null`,
    [practitionerSlug],
  );
  return result.rowCount ?? 0;
}

export async function insertPractitionerInviteInSupabase(input: {
  id: string;
  email: string;
  practitionerSlug: string;
  invitedBy: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `insert into public.practitioner_invites
       (id, email, practitioner_slug, invited_by, token_hash, expires_at, accepted_at, created_at)
     values ($1, $2, $3, $4, $5, $6, null, now())`,
    [input.id, input.email, input.practitionerSlug, input.invitedBy, input.tokenHash, input.expiresAt],
  );
}

export async function findPractitionerInviteByTokenHashInSupabase(tokenHash: string): Promise<PractitionerInviteRow | null> {
  return queryModel<PractitionerInviteRow>(
    `select ${INVITE_COLUMNS} from public.practitioner_invites
      where token_hash = $1 and accepted_at is null and expires_at > now()
      limit 1`,
    [tokenHash],
  );
}

export async function markPractitionerInviteAcceptedInSupabase(id: string): Promise<boolean> {
  const result = await query(
    `update public.practitioner_invites set accepted_at = now() where id = $1 and accepted_at is null`,
    [id],
  );
  return (result.rowCount ?? 0) === 1;
}
