import "server-only";

import { query, queryModel, queryModels } from "@/lib/postgres";

/**
 * Supabase data access for the administrator's member list: listing, creating,
 * updating and deleting member accounts.
 *
 * `plan` is always written explicitly. The column defaults to 'free', and both routes
 * fall back to "member" for an unrecognised value, so relying on the default here would
 * silently put admin-created members on a different plan than the app expects.
 */

export type MemberAdminRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  plan: string;
  onboardingComplete: boolean;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const MEMBER_COLUMNS = `id, name, email::text as email, phone, birth_date, birth_time, birth_place,
       plan, onboarding_complete, active, last_login_at, created_at, updated_at`;

export async function listMembersInSupabase(): Promise<MemberAdminRow[]> {
  return queryModels<MemberAdminRow>(
    `select ${MEMBER_COLUMNS} from public.members order by name asc`,
  );
}

export type MemberForEditRow = { id: string; name: string; email: string; plan: string; active: boolean };

export async function getMemberForEditInSupabase(id: string): Promise<MemberForEditRow | null> {
  return queryModel<MemberForEditRow>(
    `select id, name, email::text as email, plan, active from public.members where id = $1`,
    [id],
  );
}

export type NewMemberAdminInput = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  plan: string;
  active: boolean;
  onboardingComplete: boolean;
};

/** Creates the member row. Returns false if a row already claimed the id or the email:
 * `members` has a unique index on email as well as the primary key, and an `(id)` arbiter
 * would let an email collision through as an unhandled 23505. */
export async function createMemberAdminInSupabase(input: NewMemberAdminInput): Promise<boolean> {
  const result = await query(
    `insert into public.members
       (id, name, email, phone, birth_date, birth_time, birth_place, plan, active,
        onboarding_complete, created_at, updated_at, last_login_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now(), null)
     on conflict do nothing`,
    [
      input.id, input.name, input.email, input.phone, input.birthDate, input.birthTime,
      input.birthPlace, input.plan, input.active, input.onboardingComplete,
    ],
  );
  return (result.rowCount ?? 0) === 1;
}

export async function updateMemberAdminInSupabase(
  id: string,
  input: Omit<NewMemberAdminInput, "id">,
): Promise<boolean> {
  const result = await query(
    `update public.members
        set name = $2, email = $3, phone = $4, birth_date = $5, birth_time = $6,
            birth_place = $7, plan = $8, active = $9, onboarding_complete = $10,
            updated_at = now()
      where id = $1`,
    [
      id, input.name, input.email, input.phone, input.birthDate, input.birthTime,
      input.birthPlace, input.plan, input.active, input.onboardingComplete,
    ],
  );
  return (result.rowCount ?? 0) === 1;
}

/**
 * Rewrites the denormalised client email on bookings after a member's address changes.
 *
 * `client_email` is citext, so this matches case-insensitively where the Firestore query
 * was case-sensitive. Addresses are lowercased by normalizeEmail on the way in, so the two
 * agree in practice; where they differ this catches rows the old query would have missed
 * rather than leaving a booking showing a stale address.
 */
export async function updateBookingsClientEmailInSupabase(oldEmail: string, newEmail: string): Promise<number> {
  const result = await query(
    `update public.bookings set client_email = $2, updated_at = now() where client_email = $1`,
    [oldEmail, newEmail],
  );
  return result.rowCount ?? 0;
}

/**
 * Deletes the member row.
 *
 * Unlike a Firestore document delete, this is referential: 17 tables cascade and 12 set
 * member_id to null, so the member's own records (wallet, readings, chat, subscription)
 * are removed while shared financial records — bookings, payments, invoices — survive
 * with a null member rather than pointing at an account that no longer exists. No
 * reference is RESTRICT, so this cannot fail with 23503.
 */
export async function deleteMemberAdminInSupabase(id: string): Promise<boolean> {
  const result = await query(`delete from public.members where id = $1`, [id]);
  return (result.rowCount ?? 0) === 1;
}
