import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePgPool, query, withTransaction } from "@/lib/postgres";
import { SlotUnavailableError, createBookingRecord, type NewBooking } from "@/lib/booking-creation";

/**
 * Integration coverage for booking creation on Postgres. Skipped unless
 * SUPABASE_DB_URL points at a reachable database carrying the migration schema,
 * and additionally needs SUPABASE_CUTOVER=true.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/booking-creation.integration.test.ts
 *
 * The point is the double-booking race. `validateAvailableSlot` runs before the
 * insert and cannot close it; the insert takes a per-practitioner advisory lock
 * and re-tests the overlap inside it.
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const PRACTITIONER = "prac-booking-create-itest";
const SERVICE = "svc-booking-create-itest";
const MEMBER = "member-booking-create-itest";

let bookingIds: string[] = [];

async function cleanup() {
  if (bookingIds.length) {
    await query(`delete from public.bookings where id = any($1::text[])`, [bookingIds]);
  }
  bookingIds = [];
  await query(`delete from public.bookings where practitioner_id = $1`, [PRACTITIONER]);
  await query(`delete from public.services where id = $1`, [SERVICE]);
  await query(`delete from public.practitioners where id = $1`, [PRACTITIONER]);
  await query(`delete from public.members where id = $1`, [MEMBER]);
}

async function seed() {
  await cleanup();
  await query(`insert into public.members (id, name, email) values ($1, 'Booker', 'booker-create-itest@example.test')`, [MEMBER]);
  await query(`insert into public.services (id, title, slug, price, duration, active)
               values ($1, 'Kundli Reading', 'kundli-create-itest', 1100, 60, true)`, [SERVICE]);
  await query(
    `insert into public.practitioners (id, name, slug, email, active, is_demo_account, chat_rate_per_minute)
     values ($1, 'Test Astrologer', 'test-astrologer-create-itest', 'astro-create-itest@example.test', true, false, 100)`,
    [PRACTITIONER],
  );
}

const START = new Date("2027-03-15T10:00:00.000Z");
const at = (hour: number, minute = 0) => new Date(Date.UTC(2027, 2, 15, hour, minute, 0, 0));

function booking(overrides: Partial<NewBooking> = {}): NewBooking {
  return {
    reference: `JY-270315-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    serviceId: SERVICE,
    serviceTitle: "Kundli Reading",
    servicePrice: 1100,
    serviceDuration: 60,
    practitionerId: PRACTITIONER,
    practitionerName: "Test Astrologer",
    clientName: "Asha Rao",
    clientEmail: "booker-create-itest@example.test",
    clientPhone: "9876500000",
    birthDate: "1990-01-01",
    birthTime: "06:30",
    birthPlace: "Delhi, India",
    scheduledAt: START,
    notes: null,
    ...overrides,
  };
}

function track<T extends { id: string }>(record: T): T {
  bookingIds.push(record.id);
  return record;
}

describeCutover("booking creation on Postgres", () => {
  beforeEach(seed);
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("creates a pending, unpaid booking and returns it typed", async () => {
    const created = track(await createBookingRecord(booking()));
    expect(created.id).toBeTruthy();
    expect(created.reference.startsWith("JY-")).toBe(true);
    expect(created.status).toBe("pending");
    expect(created.paymentStatus).toBe("unpaid");
    expect(created.servicePrice).toBe(1100);
    // service_price is numeric; pg returns those as strings unless coerced.
    expect(typeof created.servicePrice).toBe("number");
    expect(created.scheduledAt).toBeInstanceOf(Date);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.clientEmail).toBe("booker-create-itest@example.test");

    const { rows } = await query(`select reference, status, payment_status from public.bookings where id = $1`, [created.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("refuses a booking that overlaps an existing one", async () => {
    track(await createBookingRecord(booking()));
    // Starts 30 minutes into the existing 60-minute booking.
    await expect(createBookingRecord(booking({ scheduledAt: at(10, 30) }))).rejects.toThrow(SlotUnavailableError);
  });

  it("refuses a booking that would contain an existing one", async () => {
    track(await createBookingRecord(booking({ scheduledAt: at(10, 30), serviceDuration: 30 })));
    // A 90-minute booking from 10:00 swallows the 10:30 one.
    await expect(
      createBookingRecord(booking({ scheduledAt: at(10, 0), serviceDuration: 90 })),
    ).rejects.toThrow(SlotUnavailableError);
  });

  it("allows back-to-back bookings, since one ends exactly as the next starts", async () => {
    track(await createBookingRecord(booking({ scheduledAt: at(10, 0), serviceDuration: 60 })));
    const next = track(await createBookingRecord(booking({ scheduledAt: at(11, 0), serviceDuration: 60 })));
    expect(next.scheduledAt.toISOString()).toBe(at(11, 0).toISOString());
  });

  it("allows an overlapping time once the earlier booking is cancelled", async () => {
    const first = track(await createBookingRecord(booking()));
    await query(`update public.bookings set status = 'cancelled' where id = $1`, [first.id]);
    const second = track(await createBookingRecord(booking({ scheduledAt: at(10, 30) })));
    expect(second.status).toBe("pending");
  });

  it("scopes the conflict check to the practitioner", async () => {
    await query(
      `insert into public.practitioners (id, name, slug, email, active, is_demo_account, chat_rate_per_minute)
       values ('prac-booking-other-itest', 'Other', 'other-booking-create-itest', 'other-create-itest@example.test', true, false, 100)`,
    );
    track(await createBookingRecord(booking()));
    // Same slot, different astrologer — must be allowed.
    const other = track(await createBookingRecord(booking({ practitionerId: "prac-booking-other-itest" })));
    expect(other.practitionerId).toBe("prac-booking-other-itest");
    await query(`delete from public.bookings where practitioner_id = 'prac-booking-other-itest'`);
    await query(`delete from public.practitioners where id = 'prac-booking-other-itest'`);
  });

  it("lets exactly one of two simultaneous bookings take the same slot", async () => {
    // The pre-flight slot check cannot catch this: both callers pass it before
    // either inserts. The advisory lock on the practitioner serialises the two
    // transactions, so the loser sees the winner's row and refuses.
    const attempts = await Promise.allSettled([
      createBookingRecord(booking()),
      createBookingRecord(booking()),
      createBookingRecord(booking()),
      createBookingRecord(booking()),
    ]);
    for (const attempt of attempts) {
      if (attempt.status === "fulfilled") track(attempt.value);
    }
    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(3);
    for (const attempt of failed) {
      expect((attempt as PromiseRejectedResult).reason).toBeInstanceOf(SlotUnavailableError);
    }

    const { rows } = await query(
      `select count(*)::int as count from public.bookings where practitioner_id = $1 and scheduled_at = $2`,
      [PRACTITIONER, START],
    );
    expect(rows[0].count).toBe(1);
  });

  it("lets two simultaneous bookings take different, non-overlapping slots", async () => {
    const attempts = await Promise.allSettled([
      createBookingRecord(booking({ scheduledAt: at(9, 0) })),
      createBookingRecord(booking({ scheduledAt: at(12, 0) })),
    ]);
    for (const attempt of attempts) {
      if (attempt.status === "fulfilled") track(attempt.value);
    }
    expect(attempts.every((a) => a.status === "fulfilled")).toBe(true);
  });

  it("waits for the practitioner's advisory lock rather than racing the holder", async () => {
    // Firing concurrent createBookingRecord calls does not prove the lock exists:
    // they serialise on connection-pool contention and stay green without it. This
    // holds the same advisory lock in a separate transaction and asserts the
    // caller has NOT finished, which only happens if it takes the lock. Nothing
    // later in the insert takes that lock, so there is nothing to mask it.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const holder = withTransaction(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`booking:${PRACTITIONER}`]);
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 75));

    let settled = false;
    const attempt = createBookingRecord(booking()).then((record) => { track(record); settled = true; return record; });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(settled).toBe(false);

    release();
    await holder;
    await attempt;
  });

  it("gives every booking a distinct id and reference", async () => {
    const first = track(await createBookingRecord(booking({ scheduledAt: at(9, 0) })));
    const second = track(await createBookingRecord(booking({ scheduledAt: at(12, 0) })));
    expect(first.id).not.toBe(second.id);
    expect(first.reference).not.toBe(second.reference);
  });
});
