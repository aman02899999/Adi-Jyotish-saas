import "server-only";

import { randomUUID } from "node:crypto";

import { queryModels, withTransaction } from "@/lib/postgres";

/**
 * Postgres data access for member predictions.
 *
 * getPractitionerAccuracyMap was gated first and these were not, which left the module split
 * across two stores: a prediction logged after cutover went to Firestore while the accuracy badge
 * counted rows in Postgres, so it never moved and the two stores diverged permanently. That badge
 * is public and is what a member weighs a practitioner by.
 *
 * Same split as the other *-supabase modules: statements only. Validation, the per-booking cap
 * and the resolvable-date rule stay in predictions.ts so they are written once whichever database
 * is underneath.
 */

export type PredictionRow = {
  id: string;
  memberId: string;
  memberName: string;
  practitionerId: string;
  practitionerName: string;
  bookingId: string;
  serviceTitle: string;
  text: string;
  expectedByDate: string;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
};

const COLUMNS = `
  id, member_id, member_name, practitioner_id, practitioner_name, booking_id,
  service_title, text, expected_by_date, status, created_at, resolved_at
`;

export async function listMemberPredictionsInSupabase(memberId: string): Promise<PredictionRow[]> {
  return queryModels<PredictionRow>(
    `select ${COLUMNS} from public.predictions where member_id = $1 order by created_at desc`,
    [memberId],
  );
}

/** Raised when the caller's rule — not the database's — rejected the write. */
export class PredictionConflict extends Error {
  constructor(readonly reason: "cap" | "missing" | "already_resolved" | "not_yet") {
    super(reason);
    this.name = "PredictionConflict";
  }
}

/**
 * Inserts a prediction, refusing once the booking has reached its cap.
 *
 * The cap is what stops one completed booking being used to log unlimited predictions and
 * fabricate a practitioner's public accuracy stat, so the count and the insert have to be atomic.
 * A plain count-then-insert is not: under READ COMMITTED two concurrent submissions both read a
 * count under the cap and both write. The per-booking advisory lock serialises them, matching how
 * bookings-supabase.ts guards slot conflicts rather than inventing a second mechanism.
 */
export async function insertPredictionInSupabase(input: {
  memberId: string;
  memberName: string;
  practitionerId: string;
  practitionerName: string;
  bookingId: string;
  serviceTitle: string;
  text: string;
  expectedByDate: string;
  maxPerBooking: number;
}): Promise<PredictionRow> {
  return withTransaction(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`prediction:${input.bookingId}`]);

    const existing = await client.query<{ count: string }>(
      `select count(*)::text as count from public.predictions where booking_id = $1`,
      [input.bookingId],
    );
    if (Number(existing.rows[0]?.count ?? 0) >= input.maxPerBooking) {
      throw new PredictionConflict("cap");
    }

    const inserted = await client.query(
      `insert into public.predictions
         (id, member_id, member_name, practitioner_id, practitioner_name, booking_id,
          service_title, text, expected_by_date, status, created_at, resolved_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', now(), null)
       returning ${COLUMNS}`,
      [randomUUID(), input.memberId, input.memberName, input.practitionerId, input.practitionerName,
       input.bookingId, input.serviceTitle, input.text, input.expectedByDate],
    );
    return rowToPrediction(inserted.rows[0]);
  });
}

/**
 * Marks a prediction resolved.
 *
 * `select … for update` is what stops two concurrent resolve calls both passing the still-pending
 * check and racing to write different outcomes: the second blocks until the first commits, then
 * reads the resolved status and is refused. The `and status = 'pending'` repeated on the update
 * is belt-and-braces for a future edit that drops the row lock, not the mechanism itself — no
 * test can distinguish it while the lock is there, so calling it the guard would be a lie.
 *
 * The ownership check rides on the same locking select, so a prediction belonging to someone else
 * is reported as missing rather than forbidden and the response does not confirm the id exists.
 */
export async function resolvePredictionInSupabase(input: {
  memberId: string;
  predictionId: string;
  status: string;
  today: string;
}): Promise<PredictionRow> {
  return withTransaction(async (client) => {
    const current = await client.query<{ status: string; expected_by_date: string | null }>(
      `select status, expected_by_date from public.predictions
        where id = $1 and member_id = $2 for update`,
      [input.predictionId, input.memberId],
    );
    const row = current.rows[0];
    if (!row) throw new PredictionConflict("missing");
    if (row.status !== "pending") throw new PredictionConflict("already_resolved");
    if ((row.expected_by_date ?? "") > input.today) throw new PredictionConflict("not_yet");

    const updated = await client.query(
      `update public.predictions set status = $3, resolved_at = now()
        where id = $1 and member_id = $2 and status = 'pending'
        returning ${COLUMNS}`,
      [input.predictionId, input.memberId, input.status],
    );
    if (updated.rowCount === 0) throw new PredictionConflict("already_resolved");
    return rowToPrediction(updated.rows[0]);
  });
}

function rowToPrediction(row: Record<string, unknown>): PredictionRow {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    memberName: String(row.member_name ?? ""),
    practitionerId: String(row.practitioner_id ?? ""),
    practitionerName: String(row.practitioner_name ?? ""),
    bookingId: String(row.booking_id ?? ""),
    serviceTitle: String(row.service_title ?? ""),
    text: String(row.text ?? ""),
    expectedByDate: String(row.expected_by_date ?? ""),
    status: String(row.status),
    createdAt: row.created_at as Date,
    resolvedAt: (row.resolved_at as Date | null) ?? null,
  };
}
