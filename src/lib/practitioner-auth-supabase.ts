import "server-only";

import { query, queryModel } from "@/lib/postgres";

/**
 * Supabase data access for practitioner sign-in.
 *
 * Practitioner rows are keyed by slug rather than by uid — a record can exist
 * (created by an admin invite, or seeded demo data) before any auth account is
 * linked to it — so the lookup is by firebase_uid, not by primary key.
 *
 * The `active` filter is folded into the query, as in admin-auth and member-auth:
 * it is the sign-in gate and belongs in the SQL rather than in a separate check
 * the next reader could drop.
 */

export type ActivePractitionerRow = {
  id: string;
  name: string;
  slug: string;
  email: string;
  title: string;
  photoUrl: string | null;
  online: boolean;
};

/** The active practitioner linked to this uid, or null. */
export async function getActivePractitionerByUidInSupabase(uid: string): Promise<ActivePractitionerRow | null> {
  return queryModel<ActivePractitionerRow>(
    `select id, name, slug, email::text as email, title, photo_url, online
       from public.practitioners
      where firebase_uid = $1 and active
      limit 1`,
    [uid],
  );
}

/** The linked practitioner's id, active or not.
 *
 * Deliberately unfiltered: the Firestore path stamps lastLoginAt for whoever the
 * uid resolves to, including a deactivated account, and the stamp is a record of
 * the attempt rather than a grant of access. Using the active-filtered lookup here
 * would quietly stop recording those attempts. */
export async function findPractitionerIdByUidInSupabase(uid: string): Promise<string | null> {
  const row = await queryModel<{ id: string }>(
    `select id from public.practitioners where firebase_uid = $1 limit 1`,
    [uid],
  );
  return row?.id ?? null;
}

export async function touchPractitionerLastLoginInSupabase(id: string): Promise<void> {
  await query(`update public.practitioners set last_login_at = now() where id = $1`, [id]);
}

export type PractitionerLinkRow = { id: string; active: boolean };

/** Finds the practitioner already linked to a GoTrue uid, active or not — the caller
 * has to tell those apart to return 403 rather than 404. */
export async function findPractitionerForLinkInSupabase(uid: string): Promise<PractitionerLinkRow | null> {
  return queryModel<PractitionerLinkRow>(
    `select id, active from public.practitioners where firebase_uid = $1 limit 1`,
    [uid],
  );
}

/** Finds an invited-but-not-yet-linked practitioner by email, so a Google sign-in can
 * claim it. `email` is citext, so the match is case-insensitive without lowercasing. */
export async function findPractitionerByEmailInSupabase(email: string): Promise<PractitionerLinkRow | null> {
  return queryModel<PractitionerLinkRow>(
    `select id, active from public.practitioners where email = $1 limit 1`,
    [email],
  );
}

/** Links a Google-verified uid to an invited practitioner and marks the email verified. */
export async function linkPractitionerGoogleUidInSupabase(id: string, uid: string): Promise<boolean> {
  const result = await query(
    `update public.practitioners
        set firebase_uid = $2, email_verified = true, updated_at = now()
      where id = $1`,
    [id, uid],
  );
  return (result.rowCount ?? 0) === 1;
}

export type InvitedPractitionerRow = { id: string; name: string; email: string; firebaseUid: string | null };

/** The invited practitioner behind an invite acceptance: the accept route needs their
 * name and email to create the auth account, and their existing uid to know whether one
 * already exists. */
export async function getInvitedPractitionerInSupabase(slug: string): Promise<InvitedPractitionerRow | null> {
  return queryModel<InvitedPractitionerRow>(
    `select id, name, email::text as email, firebase_uid from public.practitioners where id = $1 limit 1`,
    [slug],
  );
}

/** Links an accepted invite's new auth uid to the practitioner and stamps the login. */
export async function linkPractitionerUidInSupabase(id: string, uid: string): Promise<boolean> {
  const result = await query(
    `update public.practitioners
        set firebase_uid = $2, last_login_at = now(), updated_at = now()
      where id = $1`,
    [id, uid],
  );
  return (result.rowCount ?? 0) === 1;
}
