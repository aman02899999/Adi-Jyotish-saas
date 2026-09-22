import { beforeAll, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import {
  createMemberAdminInSupabase,
  deleteMemberAdminInSupabase,
  getMemberForEditInSupabase,
  listMembersInSupabase,
  updateBookingsClientEmailInSupabase,
  updateMemberAdminInSupabase,
} from "@/lib/member-admin-supabase";
import { getWalletBalanceInSupabase } from "@/lib/wallet-supabase";

/**
 * Integration tests for the administrator's member-list data access. Skipped unless
 * SUPABASE_DB_URL points at a reachable database.
 *
 * The routes themselves are not exercised end to end: getCurrentAdmin calls cookies(),
 * and the auth-account calls are HTTPS to GoTrue, which this sandbox cannot reach.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "memadmin_itest_";

async function seedMember(id: string, input: { name: string; email: string; plan?: string; active?: boolean }) {
  await query(
    `insert into public.members (id, name, email, plan, active, created_at, updated_at)
     values ($1, $2, $3, $4, $5, now(), now())`,
    [id, input.name, input.email, input.plan ?? "member", input.active ?? true],
  );
}

async function seedBooking(id: string, memberId: string, clientEmail: string) {
  await query(
    `insert into public.bookings
       (id, reference, service_id, service_title, practitioner_id, practitioner_name,
        client_name, client_email, member_id, scheduled_at, created_at, updated_at)
     values ($1, $1, '${P}svc', 'Test service', '${P}prac', 'Test practitioner',
             'Client', $2, $3, now(), now(), now())`,
    [id, clientEmail, memberId],
  );
}

async function seedWallet(memberId: string, balance: number) {
  await query(
    `insert into public.wallets (id, member_id, currency, balance, created_at, updated_at)
     values ($1, $1, 'INR', $2, now(), now())`,
    [memberId, balance],
  );
}

describeDb("member admin data access (live database)", () => {
  beforeAll(async () => {
    await query(`delete from public.bookings where id like 'memadmin\\_itest\\_%'`);
    await query(`delete from public.members where id like 'memadmin\\_itest\\_%'`);
    await query(`delete from public.services where id like 'memadmin\\_itest\\_%'`);
    await query(`delete from public.practitioners where id like 'memadmin\\_itest\\_%'`);

    await query(
      `insert into public.services (id, title, slug) values ($1, 'Test service', $1)`,
      [`${P}svc`],
    );
    await query(
      `insert into public.practitioners (id, name, slug, email, created_at, updated_at)
       values ($1, 'Test practitioner', $1, $2, now(), now())`,
      [`${P}prac`, `${P}prac@example.test`],
    );

    // Seeded in reverse name order: otherwise a missing `order by name` is invisible,
    // because a sequential scan returns rows in insertion order.
    await seedMember(`${P}zoe`, { name: `${P}Zoe`, email: `${P}zoe@example.test` });
    await seedMember(`${P}amy`, { name: `${P}Amy`, email: `${P}amy@example.test` });
  });

  it("lists members with the app-shaped fields, by name", async () => {
    const rows = await listMembersInSupabase();
    const mine = rows.filter((row) => row.id.startsWith(P));
    expect(mine.map((row) => row.name)).toEqual([`${P}Amy`, `${P}Zoe`]);

    const amy = mine[0];
    expect(amy).toMatchObject({
      id: `${P}amy`,
      email: `${P}amy@example.test`,
      plan: "member",
      active: true,
      onboardingComplete: false,
      phone: null,
      birthDate: null,
    });
    expect(typeof amy.email).toBe("string");
    expect(amy.createdAt).toBeInstanceOf(Date);
    expect(amy.lastLoginAt).toBeNull();
  });

  it("fetches one member for editing, or null", async () => {
    expect(await getMemberForEditInSupabase(`${P}zoe`)).toMatchObject({ name: `${P}Zoe`, plan: "member", active: true });
    expect(await getMemberForEditInSupabase(`${P}nobody`)).toBeNull();
  });

  it("creates a member on the requested plan, not the column default", async () => {
    // members.plan defaults to 'free'; every admin-created member has always been
    // created on an explicit plan, so the default must never be relied on here.
    const created = await createMemberAdminInSupabase({
      id: `${P}new`, name: `${P}New`, email: `${P}new@example.test`, phone: "99999",
      birthDate: "1990-01-01", birthTime: "08:30", birthPlace: "Delhi", plan: "premium",
      active: true, onboardingComplete: true,
    });
    expect(created).toBe(true);

    const { rows } = await query<{ plan: string; birth_place: string | null; onboarding_complete: boolean; last_login_at: Date | null }>(
      `select plan, birth_place, onboarding_complete, last_login_at from public.members where id = $1`,
      [`${P}new`],
    );
    expect(rows[0]).toMatchObject({ plan: "premium", birth_place: "Delhi", onboarding_complete: true });
    expect(rows[0]?.last_login_at).toBeNull();
  });

  it("reports not-created rather than throwing when the email is taken", async () => {
    const created = await createMemberAdminInSupabase({
      id: `${P}dupe`, name: `${P}Dupe`, email: `${P}new@example.test`, phone: null,
      birthDate: null, birthTime: null, birthPlace: null, plan: "member",
      active: true, onboardingComplete: false,
    });
    expect(created).toBe(false);

    const { rows } = await query<{ n: number }>(
      `select count(*)::int n from public.members where id = $1`,
      [`${P}dupe`],
    );
    expect(rows[0]?.n).toBe(0);
  });

  it("updates every editable field in one write", async () => {
    const ok = await updateMemberAdminInSupabase(`${P}amy`, {
      name: `${P}Amy Edited`, email: `${P}amy.edited@example.test`, phone: "88888",
      birthDate: "1992-02-02", birthTime: "06:15", birthPlace: "Pune", plan: "concierge",
      active: false, onboardingComplete: true,
    });
    expect(ok).toBe(true);

    const { rows } = await query<Record<string, unknown>>(
      `select name, email::text as email, phone, birth_date, birth_time, birth_place, plan, active, onboarding_complete, updated_at
         from public.members where id = $1`,
      [`${P}amy`],
    );
    expect(rows[0]).toMatchObject({
      name: `${P}Amy Edited`,
      email: `${P}amy.edited@example.test`,
      phone: "88888",
      birth_date: "1992-02-02",
      birth_time: "06:15",
      birth_place: "Pune",
      plan: "concierge",
      active: false,
      onboarding_complete: true,
    });

    expect(await updateMemberAdminInSupabase(`${P}nobody`, {
      name: "x", email: `${P}x@example.test`, phone: null, birthDate: null,
      birthTime: null, birthPlace: null, plan: "member", active: true, onboardingComplete: false,
    })).toBe(false);
  });

  it("rewrites the denormalised booking email for this member only", async () => {
    await seedBooking(`${P}bk_mine`, `${P}zoe`, `${P}zoe@example.test`);
    // A different member's booking happens to share the address shape; it must not move.
    await seedBooking(`${P}bk_other`, `${P}new`, `${P}other@example.test`);

    const updated = await updateBookingsClientEmailInSupabase(`${P}zoe@example.test`, `${P}zoe.new@example.test`);
    expect(updated).toBe(1);

    const { rows } = await query<{ id: string; client_email: string }>(
      `select id, client_email::text as client_email from public.bookings where id like '${P}bk\\_%' order by id`,
    );
    expect(rows.find((r) => r.id === `${P}bk_mine`)?.client_email).toBe(`${P}zoe.new@example.test`);
    expect(rows.find((r) => r.id === `${P}bk_other`)?.client_email).toBe(`${P}other@example.test`);
  });

  it("reads a wallet balance without creating the wallet", async () => {
    // A member who has never used the wallet has no row. Materialising one just to learn
    // it is empty would leave an empty wallet behind for an account about to be deleted.
    expect(await getWalletBalanceInSupabase(`${P}zoe`)).toBe(0);
    const { rows } = await query<{ n: number }>(
      `select count(*)::int n from public.wallets where id = $1`,
      [`${P}zoe`],
    );
    expect(rows[0]?.n).toBe(0);

    await seedWallet(`${P}zoe`, 1250.5);
    expect(await getWalletBalanceInSupabase(`${P}zoe`)).toBe(1250.5);
  });

  it("cascades the member's own data and keeps shared financial rows", async () => {
    await seedMember(`${P}doomed`, { name: `${P}Doomed`, email: `${P}doomed@example.test` });
    await seedWallet(`${P}doomed`, 0);
    await seedBooking(`${P}bk_doomed`, `${P}doomed`, `${P}doomed@example.test`);

    expect(await deleteMemberAdminInSupabase(`${P}doomed`)).toBe(true);

    const wallet = await query<{ n: number }>(`select count(*)::int n from public.wallets where id = $1`, [`${P}doomed`]);
    expect(wallet.rows[0]?.n).toBe(0);

    // The booking survives with member_id nulled rather than pointing at a row that is
    // gone -- which is what a Firestore document delete could not express.
    const booking = await query<{ member_id: string | null; client_email: string }>(
      `select member_id, client_email::text as client_email from public.bookings where id = $1`,
      [`${P}bk_doomed`],
    );
    expect(booking.rows[0]?.member_id).toBeNull();
    expect(booking.rows[0]?.client_email).toBe(`${P}doomed@example.test`);

    expect(await deleteMemberAdminInSupabase(`${P}doomed`)).toBe(false);
  });
});
