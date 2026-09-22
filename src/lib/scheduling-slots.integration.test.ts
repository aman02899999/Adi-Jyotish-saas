import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import { getBookingsInWindowInSupabase } from "@/lib/bookings-supabase";

// getStudioSettings is wrapped in unstable_cache, which throws "Invariant:
// incremental cache missing" outside a Next.js runtime. UTC and a zero lead time
// keep the slot arithmetic deterministic and stop every slot on the target day
// being filtered out as too soon.
vi.mock("@/lib/studio-settings", () => ({
  getStudioSettings: async () => ({
    timezone: "UTC",
    bookingLeadMinutes: 0,
    studioName: "Integration Studio",
  }),
}));

import { getAvailableSlots, validateAvailableSlot } from "@/lib/scheduling";

/**
 * Integration coverage for the booking conflict check. Skipped unless
 * SUPABASE_DB_URL points at a reachable database carrying the migration schema,
 * and the gate tests additionally need SUPABASE_CUTOVER=true.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/scheduling-slots.integration.test.ts
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const MEMBER_ID = "member-slot-itest";
const PRACTITIONER_ID = "prac-slot-itest";
// bookings.service_id is NOT NULL and a real foreign key to services, so the
// parent row has to exist before any booking can be written.
const SERVICE_ID = "svc-slot-itest";

// Far enough ahead that the lead-time filter cannot remove the whole day, and
// derived at runtime so the availability rule always matches the target weekday.
const target = new Date(Date.now() + 30 * 86400000);
const DATE = target.toISOString().slice(0, 10);
const WEEKDAY = new Date(`${DATE}T00:00:00Z`).getUTCDay();

/** 09:00 UTC on the target day, in the studio's UTC timezone. */
const at = (time: string) => new Date(`${DATE}T${time}:00Z`);

async function cleanup() {
  await query(`delete from public.bookings where practitioner_id = $1`, [PRACTITIONER_ID]);
  await query(`delete from public.services where id = $1`, [SERVICE_ID]);
  await query(`delete from public.availability_rules where practitioner_id = $1`, [PRACTITIONER_ID]);
  await query(`delete from public.practitioner_time_off where practitioner_id = $1`, [PRACTITIONER_ID]);
  await query(`delete from public.practitioners where id = $1`, [PRACTITIONER_ID]);
  await query(`delete from public.members where id = $1`, [MEMBER_ID]);
}

async function seed() {
  await cleanup();
  await query(
    `insert into public.members (id, name, email) values ($1, $2, $3)`,
    [MEMBER_ID, "Slot Member", "member-slot-itest@example.test"],
  );
  await query(
    `insert into public.services (id, title, slug) values ($1, $2, $3)
     on conflict (id) do nothing`,
    [SERVICE_ID, "Integration Consultation", "integration-consultation"],
  );
  await query(
    `insert into public.practitioners (id, name, slug, email, active, chat_rate_per_minute)
     values ($1, 'Slot Practitioner', 'slot-prac-itest', 'prac-slot-itest@example.test', true, 100)`,
    [PRACTITIONER_ID],
  );
  await query(
    `insert into public.availability_rules (id, practitioner_id, weekday, start_time, end_time, active)
     values ('rule-slot-itest', $1, $2, '09:00', '12:00', true)`,
    [PRACTITIONER_ID, WEEKDAY],
  );
}

async function seedBooking(id: string, startsAt: Date, duration: number, status: string) {
  // bookings has nine NOT NULL columns with no default — id, reference,
  // service_id, service_title, practitioner_id, practitioner_name, client_name,
  // client_email, scheduled_at. Omitting one makes the insert fail, and a booking
  // that was never written looks exactly like a conflict check that does not work.
  await query(
    `insert into public.bookings
       (id, reference, service_id, service_title, practitioner_id, practitioner_name,
        member_id, client_name, client_email, scheduled_at, service_duration, status)
     values ($1, $2, $8, 'Integration Consultation', $3, 'Slot Practitioner',
             $4, 'Slot Member', 'member-slot-itest@example.test', $5, $6, $7)`,
    [id, `REF-${id}`, PRACTITIONER_ID, MEMBER_ID, startsAt, duration, status, SERVICE_ID],
  );
}

const startsTimes = (slots: { startsAt: string }[]) =>
  slots.map((slot) => slot.startsAt.slice(11, 16)).sort();

describeDb("the booking window read on Postgres", () => {
  beforeAll(async () => {
    await seed();
    await seedBooking("booking-slot-window", at("10:00"), 60, "confirmed");
  });

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("returns bookings in the window with a numeric duration", async () => {
    const rows = await getBookingsInWindowInSupabase(at("00:00"), at("23:59"));
    expect(rows).toHaveLength(1);
    // A string duration would silently break the overlap arithmetic downstream.
    expect(typeof rows[0]?.serviceDuration).toBe("number");
    expect(rows[0]?.scheduledAt).toBeInstanceOf(Date);
    expect(rows[0]?.practitionerId).toBe(PRACTITIONER_ID);
  });

  it("excludes bookings outside the window", async () => {
    const rows = await getBookingsInWindowInSupabase(at("13:00"), at("23:00"));
    expect(rows).toHaveLength(0);
  });
});

describeCutover("getAvailableSlots reads conflicts from Postgres under cutover", () => {
  beforeAll(async () => {
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("offers every 30-minute slot in the rule window when nothing is booked", async () => {
    const { slots, timezone } = await getAvailableSlots({ date: DATE, duration: 60, practitionerId: PRACTITIONER_ID });
    // 09:00–12:00 in 60-minute blocks stepped every 30 minutes.
    expect(startsTimes(slots)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
    expect(timezone).toBe("UTC");
  });

  it("removes the slots a confirmed booking overlaps", async () => {
    await seedBooking("booking-slot-taken", at("10:00"), 60, "confirmed");
    const { slots } = await getAvailableSlots({ date: DATE, duration: 60, practitionerId: PRACTITIONER_ID });
    // The booking runs 10:00–11:00 and every slot is 60 minutes, so it overlaps the
    // 09:30, 10:00 and 10:30 starts. Only 09:00 (ends exactly at 10:00) and 11:00
    // (starts exactly at 11:00) are clear — overlaps() is exclusive at both ends.
    expect(startsTimes(slots)).toEqual(["09:00", "11:00"]);
  });

  it("lets a cancelled booking through — it must not keep blocking the slot", async () => {
    await query(`update public.bookings set status = 'cancelled' where id = 'booking-slot-taken'`);
    const { slots } = await getAvailableSlots({ date: DATE, duration: 60, practitionerId: PRACTITIONER_ID });
    expect(startsTimes(slots)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
    await query(`update public.bookings set status = 'confirmed' where id = 'booking-slot-taken'`);
  });

  it("validateAvailableSlot rejects a taken slot and accepts a free one", async () => {
    // This is the check booking creation relies on before it charges anyone.
    expect(await validateAvailableSlot({ date: DATE, duration: 60, practitionerId: PRACTITIONER_ID, startsAt: at("10:00") })).toBeNull();
    const free = await validateAvailableSlot({ date: DATE, duration: 60, practitionerId: PRACTITIONER_ID, startsAt: at("09:00") });
    expect(free?.startsAt).toBe(at("09:00").toISOString());
  });

  it("honours excludeBookingId so rescheduling does not conflict with itself", async () => {
    const { slots } = await getAvailableSlots({
      date: DATE,
      duration: 60,
      practitionerId: PRACTITIONER_ID,
      excludeBookingId: "booking-slot-taken",
    });
    expect(startsTimes(slots)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("blocks slots covered by time off", async () => {
    await query(
      `insert into public.practitioner_time_off (id, practitioner_id, starts_at, ends_at, reason)
       values ('timeoff-slot-itest', $1, $2, $3, 'Break')`,
      [PRACTITIONER_ID, at("09:00"), at("10:00")],
    );
    const { slots } = await getAvailableSlots({
      date: DATE,
      duration: 60,
      practitionerId: PRACTITIONER_ID,
      excludeBookingId: "booking-slot-taken",
    });
    expect(startsTimes(slots)).toEqual(["10:00", "10:30", "11:00"]);
  });
});
