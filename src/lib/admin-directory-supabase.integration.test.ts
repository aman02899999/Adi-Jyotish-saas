import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * The admin workspace pages' reads on Postgres. Each page queried Firestore directly while the
 * routes beside it had been ported, so after cutover an admin would have watched a frozen copy of
 * the data. Needs a migrated database and SUPABASE_CUTOVER=true.
 */
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn() }) }));

const { recordAudit } = await import("@/lib/admin-auth");
const dir = await import("@/lib/admin-directory");

const P = "adir_itest_";

async function cleanup() {
  await query(`delete from public.audit_logs where admin_id like 'adir\\_itest\\_%'`);
  await query(`delete from public.bookings where id like 'adir\\_itest\\_%'`);
  await query(`delete from public.services where id like 'adir\\_itest\\_%'`);
  await query(`delete from public.practitioners where id like 'adir\\_itest\\_%'`);
  await query(`delete from public.admin_invites where id like 'adir\\_itest\\_%'`);
  await query(`delete from public.admin_users where id like 'adir\\_itest\\_%'`);
}

async function booking(id: string, practitionerId: string, hoursFromNow: number, status: string) {
  await query(
    `insert into public.bookings (id, reference, service_id, service_title, service_price, service_duration, practitioner_id, practitioner_name,
       client_name, client_email, birth_date, birth_time, birth_place, scheduled_at, status, payment_status)
     values ($1, $1, '${P}svc', 'R', 100, 30, $2, 'P', 'C', 'c@example.test', '1990-01-01', '10:00', 'Delhi', now() + make_interval(hours => $3), $4, 'paid')`,
    [id, practitionerId, hoursFromNow, status],
  );
}

describeCutover("admin workspace reads on Postgres", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("shows on the Activity page what recordAudit just wrote, details included", async () => {
    await recordAudit({ id: `${P}admin`, name: "Itest Admin" }, "booking.updated", "booking", "JY-1", { status: "confirmed" });
    const entry = (await dir.listRecentAuditEntries(500)).find((row) => row.adminId === `${P}admin`);
    expect(entry).toMatchObject({ adminName: "Itest Admin", action: "booking.updated", entityType: "booking", entityId: "JY-1" });
    expect(JSON.parse(entry!.details!)).toEqual({ status: "confirmed" });
    expect(entry!.createdAt).toBeInstanceOf(Date);
  });

  it("counts upcoming, non-cancelled bookings per practitioner", async () => {
    for (const id of [`${P}a`, `${P}b`]) {
      await query(`insert into public.practitioners (id, name, slug, email) values ($1, $1, $1, $2)`, [id, `${id}@example.test`]);
    }
    await query(`insert into public.services (id, slug, title, category, description, price, duration) values ('${P}svc', '${P}svc', 'R', 'T', 'd', 100, 30)`);
    await booking(`${P}1`, `${P}a`, 24, "confirmed");
    await booking(`${P}2`, `${P}a`, 48, "pending");
    await booking(`${P}3`, `${P}a`, 72, "cancelled");
    await booking(`${P}4`, `${P}a`, -24, "completed");
    await booking(`${P}5`, `${P}b`, 24, "confirmed");

    const counts = await dir.countUpcomingBookingsByPractitioner();
    expect(counts[`${P}a`]).toBe(2);
    expect(counts[`${P}b`]).toBe(1);
  });

  it("cancels a pending admin invite once and says whose it was", async () => {
    await query(
      `insert into public.admin_invites (id, email, role, invited_by, expires_at, token_hash) values ($1, 'invitee@example.test', 'support', 'x', now() + interval '1 day', 'h')`,
      [`${P}inv`],
    );
    expect(await dir.deleteAdminInviteById(`${P}inv`)).toEqual({ email: "invitee@example.test" });
    expect(await dir.deleteAdminInviteById(`${P}inv`)).toBeNull();
  });

  it("reads an admin's 2FA status", async () => {
    await query(`insert into public.admin_users (id, name, email, role, totp_enabled, active) values ($1, 'A', 'adir-a@example.test', 'owner', true, true)`, [`${P}totp`]);
    expect(await dir.isAdminTotpEnabled(`${P}totp`)).toBe(true);
    expect(await dir.isAdminTotpEnabled(`${P}nobody`)).toBe(false);
  });
});
