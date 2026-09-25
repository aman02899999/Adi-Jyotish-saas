import "server-only";

import { randomUUID } from "node:crypto";

import { query, queryModel, queryModels, withTransaction } from "@/lib/postgres";

/**
 * Postgres data access for bookings.
 *
 * Data-only, same split as the other twins. The slot arithmetic, the lead-time
 * rule and the overlap test all stay in scheduling.ts — this module only returns
 * the rows those rules run against.
 */

/** The minimum needed to test a candidate slot for conflicts. */
export type BookingConflictRow = {
  id: string;
  practitionerId: string | null;
  status: string;
  scheduledAt: Date;
  serviceDuration: number;
};

/** service_duration is integer, but naming it keeps the type honest if the column
 * is ever widened to numeric — node-postgres returns numeric as a string, and a
 * string duration silently breaks the overlap arithmetic. */
const CONFLICT_NUMERIC_COLUMNS = ["serviceDuration"] as const;

/**
 * Every booking that could overlap the requested window.
 *
 * The caller widens the range by 12 hours either side, because a booking that
 * starts the previous evening can still be running into the morning. Keeping that
 * padding at the call site (rather than baking it in here) means the SQL says
 * exactly what it fetches.
 */
export async function getBookingsInWindowInSupabase(from: Date, to: Date): Promise<BookingConflictRow[]> {
  return queryModels<BookingConflictRow>(
    `select id, practitioner_id, status, scheduled_at, service_duration
       from public.bookings
      where scheduled_at >= $1 and scheduled_at < $2`,
    [from, to],
    CONFLICT_NUMERIC_COLUMNS,
  );
}

// ------------------------------------------------------------------ creation

/** Thrown when the slot was taken between validation and the insert. The caller
 * turns this into the same 409 it already returns for a failed pre-check. */
export class BookingSlotConflictError extends Error {}

export type BookingInsert = {
  reference: string;
  serviceId: string;
  serviceTitle: string;
  servicePrice: number;
  serviceDuration: number;
  practitionerId: string;
  practitionerName: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  scheduledAt: Date;
  notes: string | null;
};

export type BookingRow = BookingInsert & {
  id: string;
  status: string;
  paymentStatus: string;
  kundliSummary: string | null;
  kundliGeneratedAt: Date | null;
  varshphalSummary: string | null;
  varshphalYear: number | null;
  varshphalGeneratedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const BOOKING_COLUMNS = `
  id, reference, service_id, service_title, service_price, service_duration, practitioner_id,
  practitioner_name, client_name, client_email::text as client_email, client_phone, birth_date,
  birth_time, birth_place, scheduled_at, notes, status, payment_status, kundli_summary,
  kundli_generated_at, varshphal_summary, varshphal_year, varshphal_generated_at, created_at, updated_at`;

type BookingSqlRow = {
  id: string;
  reference: string;
  service_id: string | null;
  service_title: string | null;
  service_price: string | number | null;
  service_duration: number | null;
  practitioner_id: string | null;
  practitioner_name: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  scheduled_at: Date | null;
  notes: string | null;
  status: string | null;
  payment_status: string | null;
  kundli_summary: string | null;
  kundli_generated_at: Date | null;
  varshphal_summary: string | null;
  varshphal_year: number | null;
  varshphal_generated_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
};

/** `client.query` never applies rowToCamel — including for `returning` — so the
 * insert result is mapped here rather than read positionally. */
function bookingRowFromSql(row: BookingSqlRow): BookingRow {
  return {
    id: row.id,
    reference: row.reference,
    serviceId: row.service_id ?? "",
    serviceTitle: row.service_title ?? "",
    servicePrice: Number(row.service_price ?? 0),
    serviceDuration: Number(row.service_duration ?? 0),
    practitionerId: row.practitioner_id ?? "",
    practitionerName: row.practitioner_name ?? "",
    clientName: row.client_name ?? "",
    clientEmail: row.client_email ?? "",
    clientPhone: row.client_phone,
    birthDate: row.birth_date ?? "",
    birthTime: row.birth_time ?? "",
    birthPlace: row.birth_place ?? "",
    scheduledAt: row.scheduled_at ?? new Date(),
    notes: row.notes,
    status: row.status ?? "pending",
    paymentStatus: row.payment_status ?? "unpaid",
    kundliSummary: row.kundli_summary,
    kundliGeneratedAt: row.kundli_generated_at,
    varshphalSummary: row.varshphal_summary,
    varshphalYear: row.varshphal_year,
    varshphalGeneratedAt: row.varshphal_generated_at,
    createdAt: row.created_at ?? new Date(),
    updatedAt: row.updated_at ?? new Date(),
  };
}

/**
 * Creates a booking, refusing a slot another booking already covers.
 *
 * The pre-flight `validateAvailableSlot` in the route is advisory: it runs before
 * the insert and two requests can both pass it. Firestore closed that gap with a
 * transaction that retried on write conflict; Postgres does not retry, so the
 * transaction takes a per-practitioner advisory lock first. Every booking write
 * for one practitioner then serialises, and the overlap test inside the lock sees
 * the other transaction's insert.
 *
 * A GiST exclusion constraint over `tstzrange(scheduled_at, scheduled_at +
 * make_interval(mins => service_duration))` would enforce this in the database
 * rather than in application code. It needs the btree_gist extension and a
 * backfill over existing rows, so it is not taken here.
 */
export async function insertBookingInSupabase(values: BookingInsert): Promise<BookingRow> {
  return withTransaction(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `booking:${values.practitionerId}`,
    ]);

    const endsAt = new Date(values.scheduledAt.getTime() + values.serviceDuration * 60000);
    // Two bookings overlap when each starts before the other ends. Cancelled
    // bookings are excluded, matching the Firestore conflict check.
    const conflict = await client.query<{ id: string }>(
      `select b.id
         from public.bookings b
        where b.practitioner_id = $1
          and b.status <> 'cancelled'
          and b.scheduled_at < $2
          and b.scheduled_at + make_interval(mins => b.service_duration) > $3
        limit 1`,
      [values.practitionerId, endsAt, values.scheduledAt],
    );
    if (conflict.rows.length) throw new BookingSlotConflictError();

    const inserted = await client.query<BookingSqlRow>(
      `insert into public.bookings
         (id, reference, service_id, service_title, service_price, service_duration, practitioner_id,
          practitioner_name, client_name, client_email, client_phone, birth_date, birth_time, birth_place,
          scheduled_at, notes, status, payment_status, kundli_summary, kundli_generated_at,
          varshphal_summary, varshphal_year, varshphal_generated_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending','unpaid',
               null,null,null,null,null, now(), now())
       returning ${BOOKING_COLUMNS}`,
      [
        randomUUID(), values.reference, values.serviceId, values.serviceTitle, values.servicePrice,
        values.serviceDuration, values.practitionerId, values.practitionerName, values.clientName,
        values.clientEmail, values.clientPhone, values.birthDate, values.birthTime, values.birthPlace,
        values.scheduledAt, values.notes,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("insertBookingInSupabase returned no row");
    return bookingRowFromSql(row);
  });
}

// ------------------------------------------------------------------ reads and edits

/** numeric comes back as a string from node-postgres; a string price breaks every
 * discount and total calculated downstream. */
const BOOKING_NUMERIC = ["servicePrice"] as const;

/** Every booking, newest appointment first — the admin Bookings table's order. */
export async function listBookingsInSupabase(): Promise<BookingRow[]> {
  return queryModels<BookingRow>(
    `select ${BOOKING_COLUMNS} from public.bookings order by scheduled_at desc`,
    [],
    BOOKING_NUMERIC,
  );
}

export async function getBookingByIdInSupabase(id: string): Promise<BookingRow | null> {
  return queryModel<BookingRow>(
    `select ${BOOKING_COLUMNS} from public.bookings where id = $1`,
    [id],
    BOOKING_NUMERIC,
  );
}

/**
 * A member's own bookings, newest appointment first.
 *
 * client_email is citext, so this matches case-insensitively where Firestore
 * matched exactly. That is a deliberate superset: a member who typed their email
 * with different capitalisation at two points still sees both bookings, and no
 * one can reach a booking they do not own by changing case.
 */
export async function getBookingsByEmailInSupabase(email: string): Promise<BookingRow[]> {
  return queryModels<BookingRow>(
    `select ${BOOKING_COLUMNS} from public.bookings where client_email = $1 order by scheduled_at desc`,
    [email],
    BOOKING_NUMERIC,
  );
}

/** The member's next booking that is not cancelled, or null. */
export async function getNextBookingByEmailInSupabase(email: string, now: Date): Promise<BookingRow | null> {
  const rows = await queryModels<BookingRow>(
    `select ${BOOKING_COLUMNS} from public.bookings
      where client_email = $1 and scheduled_at > $2 and status <> 'cancelled'
      order by scheduled_at asc limit 1`,
    [email, now],
    BOOKING_NUMERIC,
  );
  return rows[0] ?? null;
}

/**
 * Bookings created on or after `from`, newest first, for the CSV export.
 *
 * `null` means the whole table. The Firestore query had no orderBy at all, so
 * the export came out in whatever order the collection returned; a deterministic
 * order costs nothing and makes two exports of the same range comparable.
 */
export async function getBookingsSinceInSupabase(from: Date | null): Promise<BookingRow[]> {
  const where = from ? " where created_at >= $1" : "";
  return queryModels<BookingRow>(
    `select ${BOOKING_COLUMNS} from public.bookings${where} order by created_at desc`,
    from ? [from] : [],
    BOOKING_NUMERIC,
  );
}

export type BookingPatch = {
  status?: string;
  scheduledAt?: Date;
  /** `undefined` leaves notes alone; `null` clears them. */
  notes?: string | null;
  /** Moves the booking to another practitioner. The caller has checked they can take it. */
  practitioner?: { id: string; name: string };
};

/**
 * Applies an admin edit, re-running the overlap test when the appointment moves.
 *
 * Firestore wrapped this in a transaction, which auto-retries when a concurrent
 * write invalidates a read. Postgres does not retry, so the serialisation has to
 * be explicit: the same per-practitioner advisory lock the insert path takes.
 * Without it two admins rescheduling the same astrologer to the same slot would
 * both pass the conflict check and both commit.
 *
 * Returns null when the booking is gone, so the route can answer 404 rather than
 * treating a vanished row as a successful no-op.
 */
export async function updateBookingInSupabase(id: string, patch: BookingPatch): Promise<BookingRow | null> {
  return withTransaction(async (client) => {
    const existing = await client.query<{ practitioner_id: string; service_duration: number; scheduled_at: Date }>(
      `select practitioner_id, service_duration, scheduled_at from public.bookings where id = $1`,
      [id],
    );
    const row = existing.rows[0];
    if (!row) return null;
    // The slot is checked against whoever will hold the booking, at the time it will be held.
    const practitionerId = patch.practitioner?.id ?? row.practitioner_id;
    const startsAt = patch.scheduledAt ?? new Date(row.scheduled_at);
    const duration = Number(row.service_duration ?? 0);

    if (patch.scheduledAt || (patch.practitioner && patch.practitioner.id !== row.practitioner_id)) {
      await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`booking:${practitionerId}`]);
      const endsAt = new Date(startsAt.getTime() + duration * 60000);
      const conflict = await client.query<{ id: string }>(
        `select b.id
           from public.bookings b
          where b.practitioner_id = $1
            and b.id <> $2
            and b.status <> 'cancelled'
            and b.scheduled_at < $3
            and b.scheduled_at + make_interval(mins => b.service_duration) > $4
          limit 1`,
        [practitionerId, id, endsAt, startsAt],
      );
      if (conflict.rows.length) throw new BookingSlotConflictError();
    }

    const sets = ["updated_at = now()"];
    const params: unknown[] = [id];
    if (patch.status !== undefined) {
      params.push(patch.status);
      sets.push(`status = $${params.length}`);
    }
    if (patch.scheduledAt) {
      params.push(patch.scheduledAt);
      sets.push(`scheduled_at = $${params.length}`);
    }
    if (patch.notes !== undefined) {
      params.push(patch.notes);
      sets.push(`notes = $${params.length}`);
    }
    if (patch.practitioner) {
      params.push(patch.practitioner.id, patch.practitioner.name);
      sets.push(`practitioner_id = $${params.length - 1}`, `practitioner_name = $${params.length}`);
    }

    const updated = await client.query<BookingSqlRow>(
      `update public.bookings set ${sets.join(", ")} where id = $1 returning ${BOOKING_COLUMNS}`,
      params,
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) return null;
    return bookingRowFromSql(updatedRow);
  });
}

/**
 * A member's completed bookings with one practitioner that have no review yet — the choices the
 * profile page's review form offers. Any review counts, hidden or not, as it did on Firestore: a
 * booking gets one review, and moderation does not reopen it.
 */
export async function getUnreviewedCompletedBookingsInSupabase(
  memberEmail: string,
  practitionerId: string,
): Promise<Array<{ id: string; serviceTitle: string; scheduledAt: Date }>> {
  const { rows } = await query<{ id: string; service_title: string; scheduled_at: Date }>(
    `select b.id, b.service_title, b.scheduled_at
       from public.bookings b
      where b.client_email = $1
        and b.practitioner_id = $2
        and b.status = 'completed'
        and not exists (
          select 1 from public.practitioner_reviews r where r.booking_id = b.id or r.id = b.id
        )
      order by b.scheduled_at desc`,
    [memberEmail, practitionerId],
  );
  return rows.map((row) => ({ id: row.id, serviceTitle: row.service_title, scheduledAt: new Date(row.scheduled_at) }));
}

/**
 * Financial rows still pointing at a booking.
 *
 * Five tables reference `bookings`, all `ON DELETE SET NULL`, so a delete would
 * quietly drop the link on invoices, payments, reviews, message threads and
 * predictions instead of failing. Detaching money from the booking it was raised
 * for is the part that is not recoverable after the fact, so the route blocks on
 * those two and lets the rest fall away.
 */
export type BookingFinancialDependents = { invoices: number; payments: number };

export async function countBookingFinancialDependentsInSupabase(id: string): Promise<BookingFinancialDependents> {
  const { rows } = await query<{ invoices: number; payments: number }>(
    `select
       (select count(*)::int from public.invoices where booking_id = $1) as invoices,
       (select count(*)::int from public.payments where booking_id = $1) as payments`,
    [id],
  );
  const row = rows[0];
  return { invoices: Number(row?.invoices ?? 0), payments: Number(row?.payments ?? 0) };
}

/** Deletes a booking and returns its reference for the audit trail, or null if it was already gone. */
export async function deleteBookingInSupabase(id: string): Promise<string | null> {
  const { rows } = await query<{ reference: string }>(
    `delete from public.bookings where id = $1 returning reference`,
    [id],
  );
  return rows[0]?.reference ?? null;
}
