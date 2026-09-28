import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import { claimDueBookingRemindersInSupabase } from "@/lib/bookings-supabase";

/**
 * The reminder claim on the Postgres path. Skipped unless SUPABASE_DB_URL points at a reachable
 * database. Every row is dated in July 2031 and `now` is passed in, so bookings other suites leave
 * in the shared database cannot fall inside the window.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "bkrem_itest_";
const PRAC = `${P}prac`;
const SERVICE = `${P}svc`;
const NOW = new Date(Date.UTC(2031, 6, 15, 6, 0));
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const DUE_BEFORE = hours(24);
const CREATED_BEFORE = hours(-1);

async function book(id: string, scheduledAt: Date, { status = "confirmed", createdAt = hours(-48) } = {}) {
  await query(
    `insert into public.bookings (id, reference, service_id, service_title, practitioner_id, practitioner_name,
       client_name, client_email, scheduled_at, status, created_at)
     values ($1, $1, $2, 'Test reading', $3, 'Test astrologer', 'Test client', $4, $5, $6, $7)`,
    [id, SERVICE, PRAC, `${id}@example.test`, scheduledAt, status, createdAt],
  );
}

const cleanup = async () => {
  await query(`delete from public.bookings where id like 'bkrem\\_itest\\_%'`);
  await query(`delete from public.services where id like 'bkrem\\_itest\\_%'`);
  await query(`delete from public.practitioners where id like 'bkrem\\_itest\\_%'`);
};

const claimIds = async () =>
  (await claimDueBookingRemindersInSupabase(NOW, DUE_BEFORE, CREATED_BEFORE)).map((row) => row.id).sort();

describeDb("booking reminder claim (live database)", () => {
  beforeAll(async () => {
    await cleanup();
    await query(`insert into public.practitioners (id, name, slug, email) values ($1, 'Test astrologer', $1, $2)`, [PRAC, `${PRAC}@example.test`]);
    await query(
      `insert into public.services (id, slug, title, category, description, price, duration) values ($1, $1, 'Test reading', 'Test', 'd', 1500, 30)`,
      [SERVICE],
    );
  });
  afterAll(cleanup);

  it("claims only upcoming, live, not-just-made bookings inside the next day, once", async () => {
    await book(`${P}due`, hours(3));
    await book(`${P}pending`, hours(20), { status: "pending" });
    await book(`${P}edge`, DUE_BEFORE);
    await book(`${P}later`, hours(30));
    await book(`${P}past`, hours(-2));
    await book(`${P}cancelled`, hours(5), { status: "cancelled" });
    await book(`${P}completed`, hours(5), { status: "completed" });
    await book(`${P}fresh`, hours(5), { createdAt: hours(-0.5) });

    const rows = await claimDueBookingRemindersInSupabase(NOW, DUE_BEFORE, CREATED_BEFORE);
    expect(rows.map((row) => row.id).sort()).toEqual([`${P}due`, `${P}edge`, `${P}pending`]);
    expect(rows.find((row) => row.id === `${P}due`)).toMatchObject({
      reference: `${P}due`,
      serviceTitle: "Test reading",
      practitionerName: "Test astrologer",
      clientName: "Test client",
      clientEmail: `${P}due@example.test`,
      scheduledAt: hours(3),
    });
    expect(await claimIds()).toEqual([]);
  });

  it("makes a rescheduled booking due again for its new time", async () => {
    await book(`${P}moved`, hours(4));
    expect(await claimIds()).toEqual([`${P}moved`]);
    await query(`update public.bookings set scheduled_at = $2 where id = $1`, [`${P}moved`, hours(10)]);
    expect(await claimIds()).toEqual([`${P}moved`]);
    expect(await claimIds()).toEqual([]);
  });

  it("hands each booking to exactly one of several overlapping runs", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `${P}race${String(i).padStart(2, "0")}`);
    for (const [i, id] of ids.entries()) await book(id, hours(1 + i));
    const runs = await Promise.all(Array.from({ length: 8 }, () => claimIds()));
    const all = runs.flat().sort();
    expect(all).toEqual(ids);
  });
});
