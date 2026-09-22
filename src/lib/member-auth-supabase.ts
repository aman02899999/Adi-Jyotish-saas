import "server-only";

import { query, queryModel } from "@/lib/postgres";

/**
 * Supabase data access for member sign-in.
 *
 * The `active` filter is folded into the identity query, matching admin-auth: it
 * is the sign-in gate, and checking it as a separate step gives the next reader a
 * chance to drop it.
 *
 * email is citext, so it is cast to text on the way out.
 */

export type ActiveMemberRow = {
  name: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  plan: string;
  onboardingComplete: boolean;
  totpEnabled: boolean;
  paymentBypass: boolean;
};

export type NewMemberInput = {
  id: string;
  name: string;
  email: string;
  locale: string;
};

/**
 * Creates the profile only if this member does not have one yet.
 *
 * Returns true when this call created it. Firestore did a get and then a set, so
 * two concurrent first sign-ins could both see "missing" and the second would
 * overwrite the first — losing anything written in between. The primary key
 * decides it here instead.
 *
 * `plan` is written explicitly: the column defaults to 'free', but the Firestore
 * path has always created members on 'member', and silently changing a new
 * member's plan would change what they can do.
 *
 * The conflict clause is deliberately untargeted. `members` carries a second
 * unique index, `members_email_key`, and an `on conflict (id)` arbiter only
 * swallows collisions on the primary key — a race against the email index
 * surfaces as an unhandled 23505 and turns a benign double sign-in into a
 * failed login. `on conflict do nothing` covers both indexes and reports
 * "not created", which is what the caller needs in either case.
 */
export async function createMemberProfileInSupabase(input: NewMemberInput): Promise<boolean> {
  const result = await query(
    `insert into public.members
       (id, name, email, phone, birth_date, birth_time, birth_place, plan,
        onboarding_complete, active, locale, created_at, updated_at, last_login_at)
     values ($1, $2, $3, null, null, null, null, 'member',
             false, true, $4, now(), now(), now())
     on conflict do nothing`,
    [input.id, input.name, input.email, input.locale],
  );
  return result.rowCount === 1;
}

export async function touchMemberLastLoginInSupabase(memberId: string): Promise<void> {
  await query(`update public.members set last_login_at = now() where id = $1`, [memberId]);
}

export async function getMemberLocaleInSupabase(memberId: string): Promise<string | null> {
  const row = await queryModel<{ locale: string | null }>(
    `select locale from public.members where id = $1`,
    [memberId],
  );
  return row?.locale ?? null;
}

export async function setMemberLocaleInSupabase(memberId: string, locale: string): Promise<void> {
  await query(`update public.members set locale = $2, updated_at = now() where id = $1`, [memberId, locale]);
}

/** The member's identity, or null when there is none OR the account is deactivated. */
export async function getActiveMemberInSupabase(memberId: string): Promise<ActiveMemberRow | null> {
  return queryModel<ActiveMemberRow>(
    `select name, email::text as email, phone, birth_date, birth_time, birth_place, plan,
            onboarding_complete, totp_enabled, payment_bypass
       from public.members
      where id = $1 and active`,
    [memberId],
  );
}
