import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import {
  createMemberProfileInSupabase,
  getActiveMemberInSupabase,
  getMemberLocaleInSupabase,
  setMemberLocaleInSupabase,
  touchMemberLastLoginInSupabase,
} from "@/lib/member-auth-supabase";
import {
  findPractitionerIdByUidInSupabase,
  getActivePractitionerByUidInSupabase,
  touchPractitionerLastLoginInSupabase,
} from "@/lib/practitioner-auth-supabase";

/**
 * Integration tests for the member and practitioner sign-in data access. Skipped
 * unless SUPABASE_DB_URL points at a reachable database.
 *
 * createMemberSession / getCurrentMember / getCurrentPractitioner are not exercised
 * end to end: all three call cookies() from next/headers, which needs a request
 * context the test runner does not have. The gates they are built from are.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "signin_itest_";

async function seedMember(id: string, opts: { active?: boolean; locale?: string | null } = {}) {
  await query(
    `insert into public.members (id, name, email, active, locale) values ($1,$2,$3,$4,$5)
     on conflict (id) do update set active = excluded.active, locale = excluded.locale`,
    [id, `Member ${id}`, `${id}@example.test`, opts.active ?? true, opts.locale ?? null],
  );
}

async function seedPractitioner(id: string, opts: { active?: boolean; uid?: string | null } = {}) {
  await query(
    `insert into public.practitioners (id, name, slug, email, active, firebase_uid)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (id) do update set active = excluded.active, firebase_uid = excluded.firebase_uid`,
    [id, `Prac ${id}`, id, `${id}@example.test`, opts.active ?? true, opts.uid ?? null],
  );
}

async function cleanup() {
  await query(`delete from public.members where id like $1`, [`${P}%`]);
  await query(`delete from public.practitioners where id like $1`, [`${P}%`]);
}

describeDb("member sign-in (live database)", () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("creates a first-sign-in profile on the member plan, not the column default", async () => {
    // members.plan defaults to 'free'. The Firestore path has always created
    // sign-ins on 'member', so relying on the default would silently change what a
    // brand-new member can do.
    const created = await createMemberProfileInSupabase({ id: `${P}new`, name: "New Member", email: `${P}new@example.test`, locale: "hi" });
    expect(created).toBe(true);

    const { rows } = await query<{ plan: string; onboarding_complete: boolean; active: boolean; locale: string }>(
      `select plan, onboarding_complete, active, locale from public.members where id = $1`,
      [`${P}new`],
    );
    expect(rows[0]).toMatchObject({ plan: "member", onboarding_complete: false, active: true, locale: "hi" });
  });

  it("does not overwrite an existing profile on a second call", async () => {
    await seedMember(`${P}existing`, { locale: "en" });
    await query(`update public.members set plan = 'premium' where id = $1`, [`${P}existing`]);

    const created = await createMemberProfileInSupabase({ id: `${P}existing`, name: "Overwrite attempt", email: "other@example.test", locale: "hi" });
    expect(created).toBe(false);

    const { rows } = await query<{ name: string; plan: string; locale: string | null }>(
      `select name, plan, locale from public.members where id = $1`,
      [`${P}existing`],
    );
    expect(rows[0]).toMatchObject({ name: `Member ${P}existing`, plan: "premium", locale: "en" });
  });

  it("reports not-created rather than throwing when the email is already taken", async () => {
    // members_email_key is a second unique index. An `on conflict (id)` arbiter
    // would let this surface as a raw 23505 and fail the sign-in outright.
    await seedMember(`${P}email_owner`);
    const taken = `${P}shared@example.test`;
    await query(`update public.members set email = $2 where id = $1`, [`${P}email_owner`, taken]);

    const created = await createMemberProfileInSupabase({ id: `${P}email_second`, name: "Second", email: taken, locale: "en" });
    expect(created).toBe(false);

    const { rows } = await query<{ n: number }>(
      `select count(*)::int n from public.members where id = $1`,
      [`${P}email_second`],
    );
    expect(rows[0]?.n).toBe(0);
  });

  it("gives concurrent first sign-ins one profile between them", async () => {
    // The Firestore path got and then set, so two concurrent first sign-ins could
    // both see "missing" and the second would overwrite the first.
    await Promise.all(Array.from({ length: 10 }, () => query(`select 1`)));

    const results = await Promise.all([
      createMemberProfileInSupabase({ id: `${P}race`, name: "A", email: `${P}race@example.test`, locale: "hi" }),
      createMemberProfileInSupabase({ id: `${P}race`, name: "B", email: `${P}race@example.test`, locale: "hi" }),
      createMemberProfileInSupabase({ id: `${P}race`, name: "C", email: `${P}race@example.test`, locale: "hi" }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);

    const { rows } = await query<{ n: number }>(`select count(*)::int n from public.members where id = $1`, [`${P}race`]);
    expect(rows[0]?.n).toBe(1);
  });

  it("returns an active member and null for a deactivated one", async () => {
    await seedMember(`${P}live`);
    await seedMember(`${P}off`, { active: false });

    const live = await getActiveMemberInSupabase(`${P}live`);
    expect(live).not.toBeNull();
    expect(live?.email).toBeTypeOf("string");
    expect(live?.paymentBypass).toBe(false);
    expect(live?.totpEnabled).toBe(false);

    // The sign-in gate. A deactivated member and a missing one are the same answer.
    expect(await getActiveMemberInSupabase(`${P}off`)).toBeNull();
    expect(await getActiveMemberInSupabase(`${P}nobody`)).toBeNull();
  });

  it("round-trips the locale and stamps the last login", async () => {
    await seedMember(`${P}locale`);
    expect(await getMemberLocaleInSupabase(`${P}locale`)).toBeNull();

    await setMemberLocaleInSupabase(`${P}locale`, "en");
    expect(await getMemberLocaleInSupabase(`${P}locale`)).toBe("en");

    const before = await query(`select last_login_at from public.members where id = $1`, [`${P}locale`]);
    expect(before.rows[0]?.last_login_at).toBeNull();
    await touchMemberLastLoginInSupabase(`${P}locale`);
    const after = await query(`select last_login_at from public.members where id = $1`, [`${P}locale`]);
    expect(after.rows[0]?.last_login_at).toBeInstanceOf(Date);
  });
});

describeDb("practitioner sign-in (live database)", () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("resolves an active practitioner by linked uid", async () => {
    await seedPractitioner(`${P}prac`, { uid: `${P}uid_live` });
    const found = await getActivePractitionerByUidInSupabase(`${P}uid_live`);
    expect(found?.id).toBe(`${P}prac`);
    expect(found?.email).toBeTypeOf("string");
    expect(found?.online).toBe(false);
  });

  it("returns null for a deactivated practitioner", async () => {
    await seedPractitioner(`${P}prac_off`, { uid: `${P}uid_off`, active: false });
    expect(await getActivePractitionerByUidInSupabase(`${P}uid_off`)).toBeNull();
    expect(await getActivePractitionerByUidInSupabase(`${P}uid_unknown`)).toBeNull();
  });

  it("still resolves the id of a deactivated practitioner, for the login stamp", async () => {
    // The Firestore path stamps lastLoginAt for whoever the uid resolves to,
    // including a deactivated account: the stamp records the attempt rather than
    // granting access. Filtering here would quietly stop recording those attempts.
    await seedPractitioner(`${P}prac_stamp`, { uid: `${P}uid_stamp`, active: false });

    const id = await findPractitionerIdByUidInSupabase(`${P}uid_stamp`);
    expect(id).toBe(`${P}prac_stamp`);

    await touchPractitionerLastLoginInSupabase(id!);
    const { rows } = await query<{ last_login_at: Date | null }>(
      `select last_login_at from public.practitioners where id = $1`,
      [`${P}prac_stamp`],
    );
    expect(rows[0]?.last_login_at).toBeInstanceOf(Date);
  });

  it("returns null when no practitioner is linked to the uid", async () => {
    await seedPractitioner(`${P}prac_unlinked`, { uid: null });
    expect(await findPractitionerIdByUidInSupabase(`${P}uid_absent`)).toBeNull();
  });
});
