import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { query, withTransaction } from "@/lib/postgres";
import {
  BookingSlotConflictError,
  countBookingFinancialDependentsInSupabase,
  deleteBookingInSupabase,
  getBookingByIdInSupabase,
  getBookingsByEmailInSupabase,
  getBookingsSinceInSupabase,
  insertBookingInSupabase,
  listBookingsInSupabase,
  updateBookingInSupabase,
  type BookingInsert,
} from "@/lib/bookings-supabase";

/**
 * Integration tests for booking reads, admin edits and deletes. Skipped unless
 * SUPABASE_DB_URL points at a reachable database.
 *
 * The focus is the reschedule overlap test, because that is the one piece of
 * Firestore behaviour Postgres does not reproduce on its own: a Firestore
 * transaction retried when a concurrent write invalidated its read, and there is
 * no equivalent here. The advisory lock has to do that work.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "bksvc_itest_";
const PRAC = `${P}prac`;
const SERVICE = `${P}svc`;

/** 10:00, 11:00, 12:00 UTC — far enough apart that only deliberate moves collide. */
const at = (hour: number, minute = 0) => new Date(Date.UTC(2030, 0, 10, hour, minute));

function insertValues(scheduledAt: Date, ref: string): BookingInsert {
  return {
    reference: ref,
    serviceId: SERVICE,
    serviceTitle: "Test reading",
    servicePrice: 1500,
    serviceDuration: 30,
    practitionerId: PRAC,
    practitionerName: "Test astrologer",
    clientName: "Test client",
    clientEmail: `${ref}@example.test`,
    clientPhone: null,
    birthDate: "1990-01-01",
    birthTime: "08:30",
    birthPlace: "Delhi",
    scheduledAt,
    notes: null,
  };
}

const cleanup = async () => {
  // Both money tables reference bookings, so they go first — and forgetting
  // `payments` here leaves a row that fails the next run on its primary key.
  await query(`delete from public.invoices where id like 'bksvc\\_itest\\_%'`);
  await query(`delete from public.payments where id like 'bksvc\\_itest\\_%'`);
  await query(`delete from public.bookings where id like 'bksvc\\_itest\\_%' or reference like 'bksvc\\_itest\\_%'`);
  await query(`delete from public.services where id like 'bksvc\\_itest\\_%'`);
  await query(`delete from public.practitioners where id like 'bksvc\\_itest\\_%'`);
};

describeDb("booking reads, edits and deletes (live database)", () => {
  let idA: string;
  let idB: string;
  let idC: string;

  beforeAll(async () => {
    await cleanup();
    await query(
      `insert into public.practitioners (id, name, slug, email) values ($1, 'Test astrologer', $1, $2)`,
      [PRAC, `${PRAC}@example.test`],
    );
    await query(
      `insert into public.services (id, slug, title, category, description, price, duration)
       values ($1, $1, 'Test reading', 'Test', 'd', 1500, 30)`,
      [SERVICE],
    );
    // Insertion order (B, A, C) differs from both the ascending (A, B, C) and the
    // descending (C, B, A) order, so neither a missing `order by` nor a reversed one
    // can pass by coincidence.
    idB = (await insertBookingInSupabase(insertValues(at(11), `${P}B`))).id;
    idA = (await insertBookingInSupabase(insertValues(at(10), `${P}A`))).id;
    idC = (await insertBookingInSupabase(insertValues(at(12), `${P}C`))).id;
  });

  afterAll(cleanup);

  it("lists bookings newest appointment first, with numeric prices", async () => {
    const mine = (await listBookingsInSupabase()).filter((b) => b.reference.startsWith(P));
    expect(mine.map((b) => b.reference)).toEqual([`${P}C`, `${P}B`, `${P}A`]);

    const row = mine.find((b) => b.id === idA);
    expect(typeof row?.servicePrice).toBe("number");
    expect(row?.servicePrice).toBe(1500);
    expect(typeof row?.serviceDuration).toBe("number");
    expect(row?.scheduledAt).toBeInstanceOf(Date);
    expect(row?.clientEmail).toBe(`${P}A@example.test`);
  });

  it("fetches one booking by id, and null for a booking that is not there", async () => {
    const row = await getBookingByIdInSupabase(idA);
    expect(row).toMatchObject({
      id: idA, reference: `${P}A`, status: "pending", paymentStatus: "unpaid",
      practitionerId: PRAC, serviceId: SERVICE, serviceDuration: 30,
    });
    expect(await getBookingByIdInSupabase(`${P}nope`)).toBeNull();
  });

  it("updates status and notes independently, leaving the rest alone", async () => {
    const afterStatus = await updateBookingInSupabase(idA, { status: "confirmed" });
    expect(afterStatus).toMatchObject({ status: "confirmed", notes: null, servicePrice: 1500 });
    // The appointment did not move as a side effect.
    expect(afterStatus?.scheduledAt.toISOString()).toBe(at(10).toISOString());

    // Stored verbatim on purpose: the trim and the 1500-character cap belong to the
    // route, which applied them before the Firestore transaction too. Doing it here
    // as well would hide from the route whether its own sanitising ran.
    const afterNotes = await updateBookingInSupabase(idA, { notes: "bring the birth certificate" });
    expect(afterNotes?.notes).toBe("bring the birth certificate");
    expect(afterNotes?.status).toBe("confirmed");

    // null clears; undefined would have left it. Both must work, or an admin
    // cannot erase a note.
    const cleared = await updateBookingInSupabase(idA, { notes: null });
    expect(cleared?.notes).toBeNull();
  });

  it("returns null rather than a fake success when the booking is gone", async () => {
    expect(await updateBookingInSupabase(`${P}nope`, { status: "confirmed" })).toBeNull();
  });

  it("refuses to reschedule onto another booking for the same practitioner", async () => {
    await expect(updateBookingInSupabase(idA, { scheduledAt: at(11) })).rejects.toBeInstanceOf(BookingSlotConflictError);
    // The rejected move left the original appointment untouched.
    expect((await getBookingByIdInSupabase(idA))?.scheduledAt.toISOString()).toBe(at(10).toISOString());
  });

  it("allows the edge of the previous booking but not an overlap", async () => {
    // A runs 30 minutes, so 10:30–11:00 ends exactly where B begins: touching is fine.
    const touching = await updateBookingInSupabase(idA, { scheduledAt: at(10, 30) });
    expect(touching?.scheduledAt.toISOString()).toBe(at(10, 30).toISOString());

    // One minute later and the two overlap.
    await expect(updateBookingInSupabase(idA, { scheduledAt: at(10, 31) })).rejects.toBeInstanceOf(BookingSlotConflictError);

    // Moving a booking onto its own slot is not a conflict with itself.
    const same = await updateBookingInSupabase(idA, { scheduledAt: at(10, 30) });
    expect(same?.id).toBe(idA);
  });

  it("frees the slot once the other booking is cancelled", async () => {
    await updateBookingInSupabase(idB, { status: "cancelled" });
    const moved = await updateBookingInSupabase(idA, { scheduledAt: at(11) });
    expect(moved?.scheduledAt.toISOString()).toBe(at(11).toISOString());
  });

  it("counts the invoices and payments still pointing at a booking", async () => {
    expect(await countBookingFinancialDependentsInSupabase(idA)).toEqual({ invoices: 0, payments: 0 });

    await query(`insert into public.invoices (id, number, booking_id) values ($1, $1, $2)`, [`${P}inv`, idA]);
    await query(`insert into public.payments (id, booking_id) values ($1, $2)`, [`${P}pay`, idA]);

    expect(await countBookingFinancialDependentsInSupabase(idA)).toEqual({ invoices: 1, payments: 1 });
    expect(await countBookingFinancialDependentsInSupabase(idB)).toEqual({ invoices: 0, payments: 0 });

    // Removing the money unblocks the delete the route's guard stands in front of.
    await query(`delete from public.invoices where id = $1`, [`${P}inv`]);
    await query(`delete from public.payments where id = $1`, [`${P}pay`]);
    expect(await countBookingFinancialDependentsInSupabase(idA)).toEqual({ invoices: 0, payments: 0 });
  });

  it("makes a second reschedule wait for the in-flight one, then lose to it", async () => {
    // The whole reason updateBookingInSupabase takes an advisory lock. Under READ
    // COMMITTED the overlap check cannot see an uncommitted row, so a second
    // reschedule onto the same slot would pass and commit unless something
    // serialises the two. Parking the first transaction mid-flight makes the
    // guarantee observable rather than a race we hope to win.
    const P3 = `${P}lock`;
    await query(
      `insert into public.practitioners (id, name, slug, email) values ($1, 'Lock astrologer', $1, $2)
       on conflict (id) do nothing`,
      [P3, `${P3}@example.test`],
    );
    const first = (await insertBookingInSupabase({ ...insertValues(new Date(Date.UTC(2030, 2, 5, 10)), `${P3}1`), practitionerId: P3 })).id;
    const second = (await insertBookingInSupabase({ ...insertValues(new Date(Date.UTC(2030, 2, 5, 14)), `${P3}2`), practitionerId: P3 })).id;
    const target = new Date(Date.UTC(2030, 2, 5, 9));

    let release!: () => void;
    const parked = new Promise<void>((resolve) => { release = resolve; });

    // Transaction 1: take the same lock the code under test takes, pass the overlap
    // check, then hold the transaction open.
    const inFlight = withTransaction(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`booking:${P3}`]);
      await parked;
      await client.query(`update public.bookings set scheduled_at = $1 where id = $2`, [target, first]);
    });
    // Let transaction 1 reach the parked point.
    await new Promise((resolve) => setTimeout(resolve, 120));

    const contender = updateBookingInSupabase(second, { scheduledAt: target });
    contender.catch(() => {}); // handled by the expect below; keeps Node quiet meanwhile

    // While transaction 1 still holds the lock this must be unable to finish. Without
    // the lock it would complete in a few milliseconds and commit an overlap.
    const state = await Promise.race([
      contender.then(() => "settled", () => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 2000)),
    ]);
    expect(state).toBe("blocked");

    release();
    await inFlight;
    await expect(contender).rejects.toBeInstanceOf(BookingSlotConflictError);

    // The database agrees: one booking at that slot, not two.
    const { rows } = await query<{ n: number }>(
      `select count(*)::int as n from public.bookings where practitioner_id = $1 and scheduled_at = $2`,
      [P3, target],
    );
    expect(rows[0].n).toBe(1);
  });

  it("lists a member's own bookings by email, ignoring case", async () => {
    // client_email is citext: matching case-insensitively is what lets a member who
    // typed their address differently on two bookings still see both.
    // Inserted earliest-appointment-first, so the expected descending order is the
    // reverse of insertion order and a missing `order by` cannot pass by luck.
    await insertBookingInSupabase({ ...insertValues(at(8), `${P}mail2`), clientEmail: "Member@test.example" });
    await insertBookingInSupabase({ ...insertValues(at(9), `${P}mail1`), clientEmail: "Member@Test.Example" });
    await insertBookingInSupabase({ ...insertValues(at(7), `${P}mail3`), clientEmail: "someone.else@example.test" });

    const mine = await getBookingsByEmailInSupabase("member@test.example");
    // Newest appointment first — asserted on the array itself, not a sorted copy.
    expect(mine.map((b) => b.reference)).toEqual([`${P}mail1`, `${P}mail2`]);

    expect(await getBookingsByEmailInSupabase("nobody@example.test")).toEqual([]);
  });

  it("filters the export by creation date, and returns everything for null", async () => {
    const old = (await insertBookingInSupabase(insertValues(at(6), `${P}old`))).id;
    const fresh = (await insertBookingInSupabase(insertValues(at(5), `${P}fresh`))).id;
    await query(`update public.bookings set created_at = now() - interval '100 days' where id = $1`, [old]);

    const since = (await getBookingsSinceInSupabase(new Date(Date.now() - 30 * 86400000))).filter((b) => b.reference.startsWith(P));
    const refs = since.map((b) => b.reference);
    expect(refs).toContain(`${P}fresh`);
    expect(refs).not.toContain(`${P}old`);

    const all = (await getBookingsSinceInSupabase(null)).filter((b) => b.reference.startsWith(P));
    expect(all.map((b) => b.reference)).toEqual(expect.arrayContaining([`${P}old`, `${P}fresh`]));
    // Newest creation first, so two exports of the same range are comparable.
    const created = all.map((b) => b.createdAt.getTime());
    expect(created).toEqual([...created].sort((a, b) => b - a));

    expect(fresh).toBeTruthy();

    // A booking created exactly on the boundary belongs in the range: the filter is
    // `>=`, so a "30d" export covers the full 30 days rather than 30 days minus an
    // instant. Pinning created_at to the same instant the query uses makes that
    // distinction observable instead of a coin toss on `now()`.
    const boundary = new Date(Date.now() - 30 * 86400000);
    const edge = (await insertBookingInSupabase(insertValues(at(4), `${P}edge`))).id;
    await query(`update public.bookings set created_at = $2 where id = $1`, [edge, boundary]);
    const atBoundary = (await getBookingsSinceInSupabase(boundary)).filter((b) => b.reference.startsWith(P));
    expect(atBoundary.map((b) => b.reference)).toContain(`${P}edge`);
  });

  it("deletes a booking and hands back its reference once", async () => {
    expect(await deleteBookingInSupabase(idA)).toBe(`${P}A`);
    expect(await getBookingByIdInSupabase(idA)).toBeNull();
    // Already gone — the route answers 404 on this, not a second silent success.
    expect(await deleteBookingInSupabase(idA)).toBeNull();
  });
});

describeDb("moving a booking to another practitioner (live database)", () => {
  const FROM = `${P}from`;
  const TO = `${P}to`;
  const day = (hour: number) => new Date(Date.UTC(2030, 1, 14, hour));
  const booking = (practitionerId: string, hour: number, ref: string): BookingInsert => ({
    ...insertValues(day(hour), ref),
    practitionerId,
    practitionerName: practitionerId,
  });

  beforeAll(async () => {
    await cleanup();
    for (const id of [FROM, TO]) {
      await query(`insert into public.practitioners (id, name, slug, email) values ($1, $1, $1, $2)`, [id, `${id}@example.test`]);
    }
    await query(
      `insert into public.services (id, slug, title, category, description, price, duration)
       values ($1, $1, 'Test reading', 'Test', 'd', 1500, 30)`,
      [SERVICE],
    );
  });
  afterAll(cleanup);

  it("moves the booking and its practitioner name, keeping the time", async () => {
    const { id } = await insertBookingInSupabase(booking(FROM, 9, `${P}move`));
    const moved = await updateBookingInSupabase(id, { practitioner: { id: TO, name: "The new astrologer" } });

    expect(moved).toMatchObject({ practitionerId: TO, practitionerName: "The new astrologer" });
    expect(moved?.scheduledAt.toISOString()).toBe(day(9).toISOString());
  });

  it("refuses when the new practitioner is already booked at that time", async () => {
    await insertBookingInSupabase(booking(TO, 11, `${P}taken`));
    const { id } = await insertBookingInSupabase(booking(FROM, 11, `${P}clash`));

    await expect(updateBookingInSupabase(id, { practitioner: { id: TO, name: "x" } })).rejects.toBeInstanceOf(BookingSlotConflictError);
    expect((await getBookingByIdInSupabase(id))?.practitionerId).toBe(FROM);
  });

  it("checks the new practitioner at the new time when both change", async () => {
    await insertBookingInSupabase(booking(TO, 14, `${P}busy-later`));
    const { id } = await insertBookingInSupabase(booking(FROM, 13, `${P}both`));

    await expect(updateBookingInSupabase(id, { practitioner: { id: TO, name: "x" }, scheduledAt: day(14) })).rejects.toBeInstanceOf(BookingSlotConflictError);
    const moved = await updateBookingInSupabase(id, { practitioner: { id: TO, name: "x" }, scheduledAt: day(15) });
    expect(moved).toMatchObject({ practitionerId: TO });
    expect(moved?.scheduledAt.toISOString()).toBe(day(15).toISOString());
  });
});
