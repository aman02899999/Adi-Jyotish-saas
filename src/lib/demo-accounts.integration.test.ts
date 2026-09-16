import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import {
  demoMemberExistsInSupabase,
  demoPractitionerExistsInSupabase,
  insertDemoMemberInSupabase,
  insertDemoPractitionerInSupabase,
  seedDemoAvailabilityInSupabase,
  updateDemoMemberInSupabase,
  updateDemoPractitionerInSupabase,
  upsertDemoAdminInSupabase,
  upsertDemoSubscriptionInSupabase,
} from "@/lib/demo-accounts-supabase";

/**
 * Integration tests for the demo-account seeder's data access. Skipped unless
 * SUPABASE_DB_URL points at a reachable database.
 *
 * The seeder is documented as safe to call repeatedly, so every case here runs the
 * operation twice and asserts the second call is an update rather than a duplicate.
 * The auth-account upsert is not covered: it is HTTPS to GoTrue.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "demo_itest_";

describeDb("demo account seeding (live database)", () => {
  beforeAll(async () => {
    await query(`delete from public.availability_rules where practitioner_id like 'demo\\_itest\\_%'`);
    await query(`delete from public.member_subscriptions where id like 'demo\\_itest\\_%'`);
    await query(`delete from public.membership_plans where id like 'demo\\_itest\\_%'`);
    await query(`delete from public.practitioners where id like 'demo\\_itest\\_%'`);
    await query(`delete from public.members where id like 'demo\\_itest\\_%'`);
    await query(`delete from public.admin_users where id like 'demo\\_itest\\_%'`);

    // member_subscriptions.plan_id is a foreign key, so the plans have to exist first.
    for (const key of ["plan", "plan2"]) {
      await query(
        `insert into public.membership_plans (id, key, name) values ($1, $1, $2)`,
        [`${P}${key}`, `${P}${key}`],
      );
    }
  });

  afterAll(async () => {
    // Leave nothing behind that another test file would trip over. The plan rows in
    // particular are referenced by member_subscriptions, and that foreign key makes an
    // unrelated file's whole-table `delete from membership_plans` fail -- which surfaces
    // as that file's tests silently skipping rather than as an error.
    await query(`delete from public.member_subscriptions where id like 'demo\\_itest\\_%'`);
    await query(`delete from public.membership_plans where id like 'demo\\_itest\\_%'`);
  });

  it("upserts an owner demo admin and keeps it demo-flagged on re-seed", async () => {
    expect(await upsertDemoAdminInSupabase({ id: `${P}admin`, name: "First name", email: `${P}admin@example.test` })).toBe(true);
    const inserted = await query<{ role: string; active: boolean; is_demo_account: boolean; last_login_at: Date | null }>(
      `select role, active, is_demo_account, last_login_at from public.admin_users where id = $1`,
      [`${P}admin`],
    );
    expect(inserted.rows[0]).toMatchObject({ role: "owner", active: true, is_demo_account: true });
    expect(inserted.rows[0]?.last_login_at).toBeNull();

    // Re-seeding updates in place: one row, new name, still owner and still demo-flagged.
    // requestPayout checks is_demo_account, so a re-seed that cleared it would be a
    // payout hole rather than a cosmetic bug.
    // Deactivate first, so the re-seed has to put it back. Asserting `active` only on the
    // insert path would pass even if the update branch left it alone.
    await query(`update public.admin_users set active = false, role = 'viewer', is_demo_account = false where id = $1`, [`${P}admin`]);

    expect(await upsertDemoAdminInSupabase({ id: `${P}admin`, name: "Second name", email: `${P}admin@example.test` })).toBe(true);
    const reseeded = await query<{ name: string; role: string; active: boolean; is_demo_account: boolean }>(
      `select name, role, active, is_demo_account from public.admin_users where id = $1`,
      [`${P}admin`],
    );
    expect(reseeded.rows).toHaveLength(1);
    expect(reseeded.rows[0]).toMatchObject({ name: "Second name", role: "owner", active: true, is_demo_account: true });
  });

  it("creates a fully configured demo practitioner", async () => {
    expect(await demoPractitionerExistsInSupabase(`${P}prac`)).toBe(false);
    expect(await insertDemoPractitionerInSupabase({
      slug: `${P}prac`, name: `${P}Prac`, email: `${P}prac@example.test`, uid: `${P}uid1`, bio: "demo",
    })).toBe(true);
    expect(await demoPractitionerExistsInSupabase(`${P}prac`)).toBe(true);

    const { rows } = await query<Record<string, unknown>>(
      `select slug, firebase_uid, online, active, verified, featured, has_portal_access, is_demo_account,
              chat_rate_per_minute::int as chat_rate_per_minute
         from public.practitioners where id = $1`,
      [`${P}prac`],
    );
    expect(rows[0]).toMatchObject({
      slug: `${P}prac`,
      firebase_uid: `${P}uid1`,
      online: true,
      active: true,
      verified: true,
      featured: true,
      has_portal_access: true,
      is_demo_account: true,
      chat_rate_per_minute: 15,
    });
  });

  it("seeds seven availability rules and does not duplicate them on re-seed", async () => {
    expect(await seedDemoAvailabilityInSupabase(`${P}prac`)).toBe(7);
    const first = await query<{ n: number; days: number }>(
      `select count(*)::int n, count(distinct weekday)::int days from public.availability_rules where practitioner_id = $1`,
      [`${P}prac`],
    );
    expect(first.rows[0]).toMatchObject({ n: 7, days: 7 });

    // The rule id is derived from slug and weekday, so a second run adds nothing. The
    // Firestore version used an auto-generated document id and relied on only ever
    // running in the create branch.
    expect(await seedDemoAvailabilityInSupabase(`${P}prac`)).toBe(0);
    const second = await query<{ n: number }>(
      `select count(*)::int n from public.availability_rules where practitioner_id = $1`,
      [`${P}prac`],
    );
    expect(second.rows[0]?.n).toBe(7);
  });

  it("re-links an existing demo practitioner to a fresh uid", async () => {
    expect(await updateDemoPractitionerInSupabase(`${P}prac`, `${P}uid2`)).toBe(true);
    const { rows } = await query<{ firebase_uid: string | null; is_demo_account: boolean; active: boolean }>(
      `select firebase_uid, is_demo_account, active from public.practitioners where id = $1`,
      [`${P}prac`],
    );
    expect(rows[0]).toMatchObject({ firebase_uid: `${P}uid2`, is_demo_account: true, active: true });
    expect(await updateDemoPractitionerInSupabase(`${P}absent`, `${P}uid3`)).toBe(false);
  });

  it("creates a demo member as onboarded and demo-flagged", async () => {
    expect(await demoMemberExistsInSupabase(`${P}mem`)).toBe(false);
    expect(await insertDemoMemberInSupabase({ id: `${P}mem`, name: `${P}Mem`, email: `${P}mem@example.test`, plan: "pro" })).toBe(true);
    expect(await demoMemberExistsInSupabase(`${P}mem`)).toBe(true);

    const { rows } = await query<Record<string, unknown>>(
      `select plan, active, is_demo_account, onboarding_complete, birth_place, last_login_at
         from public.members where id = $1`,
      [`${P}mem`],
    );
    expect(rows[0]).toMatchObject({
      plan: "pro", active: true, is_demo_account: true, onboarding_complete: true, birth_place: "Jaipur, India",
    });
    expect(rows[0]?.last_login_at).toBeNull();
  });

  it("updates an existing demo member without losing its demo flag", async () => {
    expect(await updateDemoMemberInSupabase({ id: `${P}mem`, name: `${P}Mem Two`, email: `${P}mem@example.test`, plan: "concierge" })).toBe(true);
    const { rows } = await query<{ name: string; plan: string; is_demo_account: boolean; active: boolean }>(
      `select name, plan, is_demo_account, active from public.members where id = $1`,
      [`${P}mem`],
    );
    expect(rows[0]).toMatchObject({ name: `${P}Mem Two`, plan: "concierge", is_demo_account: true, active: true });
    expect(await updateDemoMemberInSupabase({ id: `${P}absent`, name: "x", email: "x@example.test", plan: "pro" })).toBe(false);
  });

  it("upserts an active yearly subscription rather than stacking a second one", async () => {
    expect(await upsertDemoSubscriptionInSupabase(`${P}mem`, `${P}plan`)).toBe(true);
    const created = await query<{ status: string; billing_interval: string; cancel_at_period_end: boolean }>(
      `select status, billing_interval, cancel_at_period_end from public.member_subscriptions where id = $1`,
      [`${P}mem`],
    );
    expect(created.rows).toHaveLength(1);
    expect(created.rows[0]).toMatchObject({ status: "active", billing_interval: "yearly", cancel_at_period_end: false });

    // A member who cancelled since the last seeding run comes back active.
    await query(`update public.member_subscriptions set status = 'cancelled', cancel_at_period_end = true where id = $1`, [`${P}mem`]);
    expect(await upsertDemoSubscriptionInSupabase(`${P}mem`, `${P}plan2`)).toBe(true);
    const revived = await query<{ status: string; plan_id: string; cancel_at_period_end: boolean }>(
      `select status, plan_id, cancel_at_period_end from public.member_subscriptions where id = $1`,
      [`${P}mem`],
    );
    expect(revived.rows).toHaveLength(1);
    expect(revived.rows[0]).toMatchObject({ status: "active", plan_id: `${P}plan2`, cancel_at_period_end: false });
  });
});
