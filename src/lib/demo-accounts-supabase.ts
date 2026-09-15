import "server-only";

import { query } from "@/lib/postgres";

/**
 * Supabase data access for the demo-account seeder.
 *
 * Every function here is create-or-update, because the route is documented as safe to
 * call repeatedly: re-running issues a fresh shared password and re-tops everything up
 * rather than erroring or duplicating anything.
 *
 * `is_demo_account` is forced true on both the insert and the update paths. Real money
 * must not be able to leave the system through these accounts — requestPayout checks the
 * flag — so a re-seed that quietly cleared it would be a payout hole, not a cosmetic bug.
 */

/** Upserts an Owner-role demo administrator. */
export async function upsertDemoAdminInSupabase(input: { id: string; name: string; email: string }): Promise<boolean> {
  const result = await query(
    `insert into public.admin_users (id, name, email, role, active, is_demo_account, last_login_at, created_at, updated_at)
     values ($1, $2, $3, 'owner', true, true, null, now(), now())
     on conflict (id) do update
        set name = excluded.name,
            email = excluded.email,
            role = 'owner',
            active = true,
            is_demo_account = true,
            updated_at = now()`,
    [input.id, input.name, input.email],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function demoPractitionerExistsInSupabase(slug: string): Promise<boolean> {
  const result = await query(`select 1 from public.practitioners where id = $1 limit 1`, [slug]);
  return result.rows.length > 0;
}

/** Re-links an existing demo practitioner to a freshly issued auth uid. */
export async function updateDemoPractitionerInSupabase(slug: string, uid: string): Promise<boolean> {
  const result = await query(
    `update public.practitioners
        set firebase_uid = $2, online = true, active = true, verified = true,
            featured = true, has_portal_access = true, is_demo_account = true, updated_at = now()
      where id = $1`,
    [slug, uid],
  );
  return (result.rowCount ?? 0) === 1;
}

export type NewDemoPractitionerInput = {
  slug: string;
  name: string;
  email: string;
  uid: string;
  bio: string;
};

export async function insertDemoPractitionerInSupabase(input: NewDemoPractitionerInput): Promise<boolean> {
  const result = await query(
    `insert into public.practitioners
       (id, name, slug, email, title, bio, specialties, languages, consultation_modes,
        experience_years, verified, verification_level, photo_url, video_url, online,
        chat_rate_per_minute, active, featured, has_portal_access, is_demo_account,
        firebase_uid, last_login_at, created_at, updated_at)
     values ($1, $2, $1, $3, 'Vedic Astrologer', $4,
             'Birth charts, Career, Relationships, Gemstones', 'English, Hindi', 'Video, Audio, Chat',
             10, true, 'senior-panel', null, null, true,
             15, true, true, true, true,
             $5, null, now(), now())
     on conflict do nothing`,
    [input.slug, input.name, input.email, input.bio, input.uid],
  );
  return (result.rowCount ?? 0) === 1;
}

/**
 * Gives a newly created demo practitioner all-day availability for every weekday.
 *
 * The rule id is derived from the slug and weekday rather than generated, so calling
 * this twice cannot produce two rules for the same day. The Firestore version used an
 * auto-generated document id and relied on only ever running in the create branch.
 */
export async function seedDemoAvailabilityInSupabase(slug: string): Promise<number> {
  let inserted = 0;
  for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
    const result = await query(
      `insert into public.availability_rules (id, practitioner_id, weekday, start_time, end_time, active, created_at, updated_at)
       values ($1, $2, $3, '00:00', '23:59', true, now(), now())
       on conflict do nothing`,
      [`${slug}:${weekday}`, slug, weekday],
    );
    inserted += (result.rowCount ?? 0) === 1 ? 1 : 0;
  }
  return inserted;
}

export async function demoMemberExistsInSupabase(id: string): Promise<boolean> {
  const result = await query(`select 1 from public.members where id = $1 limit 1`, [id]);
  return result.rows.length > 0;
}

export async function updateDemoMemberInSupabase(input: {
  id: string; name: string; email: string; plan: string;
}): Promise<boolean> {
  const result = await query(
    `update public.members
        set name = $2, email = $3, active = true, is_demo_account = true, plan = $4, updated_at = now()
      where id = $1`,
    [input.id, input.name, input.email, input.plan],
  );
  return (result.rowCount ?? 0) === 1;
}

export async function insertDemoMemberInSupabase(input: {
  id: string; name: string; email: string; plan: string;
}): Promise<boolean> {
  const result = await query(
    `insert into public.members
       (id, name, email, phone, birth_date, birth_time, birth_place, plan, active,
        is_demo_account, onboarding_complete, last_login_at, created_at, updated_at)
     values ($1, $2, $3, null, '1994-06-15', '07:45', 'Jaipur, India', $4, true,
             true, true, null, now(), now())
     on conflict do nothing`,
    [input.id, input.name, input.email, input.plan],
  );
  return (result.rowCount ?? 0) === 1;
}

/** Upserts an active yearly subscription. `member_subscriptions.id` is the member id. */
export async function upsertDemoSubscriptionInSupabase(memberId: string, planId: string): Promise<boolean> {
  const result = await query(
    `insert into public.member_subscriptions
       (id, member_id, plan_id, billing_interval, status, razorpay_subscription_id, razorpay_customer_id,
        current_period_start, current_period_end, cancel_at_period_end, cancelled_at, created_at, updated_at)
     values ($1, $1, $2, 'yearly', 'active', null, null,
             now(), now() + interval '365 days', false, null, now(), now())
     on conflict (id) do update
        set plan_id = excluded.plan_id,
            billing_interval = 'yearly',
            status = 'active',
            current_period_start = now(),
            current_period_end = now() + interval '365 days',
            cancel_at_period_end = false,
            cancelled_at = null,
            updated_at = now()`,
    [memberId, planId],
  );
  return (result.rowCount ?? 0) > 0;
}
