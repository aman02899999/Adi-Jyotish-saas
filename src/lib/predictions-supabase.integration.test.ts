import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import {
  insertPredictionInSupabase,
  listMemberPredictionsInSupabase,
  resolvePredictionInSupabase,
} from "@/lib/predictions-supabase";

/**
 * The prediction write path on Postgres. Skipped unless SUPABASE_DB_URL points at a database
 * carrying the migration schema.
 *
 * Only getPractitionerAccuracyMap was gated at first, so after cutover a prediction was logged to
 * Firestore while the accuracy badge counted Postgres rows: the badge never moved, and the two
 * stores diverged permanently. That badge is public and is what a member weighs a practitioner by.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const MEMBER_ID = "member-pred-itest";
const OTHER_MEMBER_ID = "member-pred-other-itest";
const BOOKING_ID = "booking-pred-itest";
const OTHER_BOOKING_ID = "booking-pred-other-itest";
const PRACTITIONER_ID = "practitioner-pred-itest";
const SERVICE_ID = "service-pred-itest";
const CAP = 5;
const PAST = "2020-01-01";
const FUTURE = "2099-01-01";
const TODAY = new Date().toISOString().slice(0, 10);

function base(overrides: Partial<Parameters<typeof insertPredictionInSupabase>[0]> = {}) {
  return {
    memberId: MEMBER_ID, memberName: "Asha", practitionerId: PRACTITIONER_ID, practitionerName: "Ravi",
    bookingId: BOOKING_ID, serviceTitle: "Kundli reading",
    text: "A change of role before the monsoon.", expectedByDate: FUTURE, maxPerBooking: CAP,
    ...overrides,
  };
}

/**
 * predictions.practitioner_id and .booking_id are real foreign keys, unlike Firestore where they
 * were loose strings. Seeding the parents rather than coercing them away matters: the per-booking
 * cap counts by booking_id, so nulling it would silently pool every prediction into one bucket.
 */
async function reset() {
  await query(`delete from public.predictions where member_id = any($1::text[])`, [[MEMBER_ID, OTHER_MEMBER_ID]]);
  await query(`delete from public.bookings where id = any($1::text[])`, [[BOOKING_ID, OTHER_BOOKING_ID]]);
  await query(`delete from public.services where id = $1`, [SERVICE_ID]);
  await query(`delete from public.practitioners where id = $1`, [PRACTITIONER_ID]);
  for (const id of [MEMBER_ID, OTHER_MEMBER_ID]) {
    await query(`delete from public.members where id = $1`, [id]);
    await query(
      `insert into public.members (id, name, email) values ($1, 'Pred Test', $2)`,
      [id, `${id}@example.test`],
    );
  }
  await query(
    `insert into public.practitioners (id, name, slug, email) values ($1, 'Ravi', $1, $2)`,
    [PRACTITIONER_ID, `${PRACTITIONER_ID}@example.test`],
  );
  await query(
    `insert into public.services (id, title, slug) values ($1, 'Kundli reading', $1)`,
    [SERVICE_ID],
  );
  for (const bookingId of [BOOKING_ID, OTHER_BOOKING_ID]) {
    await query(
      `insert into public.bookings
         (id, reference, service_id, service_title, practitioner_id, practitioner_name,
          client_name, client_email, scheduled_at)
       values ($1, $1, $4, 'Kundli reading', $2, 'Ravi', 'Asha', $3, now())`,
      [bookingId, PRACTITIONER_ID, `${MEMBER_ID}@example.test`, SERVICE_ID],
    );
  }
}

describeDb("prediction writes on Postgres", () => {
  beforeEach(reset);
  afterAll(async () => {
    await query(`delete from public.predictions where member_id = any($1::text[])`, [[MEMBER_ID, OTHER_MEMBER_ID]]);
    await query(`delete from public.bookings where id = any($1::text[])`, [[BOOKING_ID, OTHER_BOOKING_ID]]);
    await query(`delete from public.services where id = $1`, [SERVICE_ID]);
    await query(`delete from public.practitioners where id = $1`, [PRACTITIONER_ID]);
    await query(`delete from public.members where id = any($1::text[])`, [[MEMBER_ID, OTHER_MEMBER_ID]]);
    await closePgPool();
  });

  it("stores a prediction as pending and reads it back", async () => {
    const created = await insertPredictionInSupabase(base());
    expect(created).toMatchObject({
      memberId: MEMBER_ID, bookingId: BOOKING_ID, status: "pending", expectedByDate: FUTURE,
    });
    expect(created.resolvedAt).toBeNull();
    expect(created.id).toBeTruthy();
  });

  it("lists a member's predictions newest first", async () => {
    const first = await insertPredictionInSupabase(base({ text: "first prediction here" }));
    await query(`update public.predictions set created_at = now() - interval '1 day' where id = $1`, [first.id]);
    const second = await insertPredictionInSupabase(base({ text: "second prediction here" }));

    const listed = await listMemberPredictionsInSupabase(MEMBER_ID);
    expect(listed.map((p) => p.id)).toEqual([second.id, first.id]);
  });

  it("does not leak another member's predictions", async () => {
    await insertPredictionInSupabase(base({ memberId: OTHER_MEMBER_ID }));
    expect(await listMemberPredictionsInSupabase(MEMBER_ID)).toEqual([]);
  });

  it("allows predictions up to the per-booking cap", async () => {
    for (let i = 0; i < CAP; i += 1) await insertPredictionInSupabase(base());
    expect(await listMemberPredictionsInSupabase(MEMBER_ID)).toHaveLength(CAP);
  });

  it("refuses the one past the cap", async () => {
    for (let i = 0; i < CAP; i += 1) await insertPredictionInSupabase(base());
    // Without the cap a single completed booking logs unlimited predictions and fabricates a
    // practitioner's public accuracy stat.
    await expect(insertPredictionInSupabase(base())).rejects.toMatchObject({ reason: "cap" });
    expect(await listMemberPredictionsInSupabase(MEMBER_ID)).toHaveLength(CAP);
  });

  it("holds the cap against concurrent submissions on the same booking", async () => {
    // Two racing inserts are not enough to prove this: they usually serialise on their own and
    // the test passes even with the lock removed, which is how a broken guard looks healthy.
    // Firing well past the cap at once is what actually exercises it — every attempt reads the
    // count before any of them commits unless the advisory lock serialises them.
    const attempts = CAP * 4;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () => insertPredictionInSupabase(base())),
    );

    const stored = await listMemberPredictionsInSupabase(MEMBER_ID);
    // The invariant, not the arithmetic: one completed booking must never yield more than the cap,
    // or a practitioner's public accuracy stat can be fabricated.
    expect(stored).toHaveLength(CAP);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(CAP);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(attempts - CAP);
  });

  it("counts the cap per booking, not per member", async () => {
    for (let i = 0; i < CAP; i += 1) await insertPredictionInSupabase(base());
    await expect(insertPredictionInSupabase(base({ bookingId: OTHER_BOOKING_ID }))).resolves.toBeTruthy();
  });

  it("resolves a prediction whose expected-by date has passed", async () => {
    const created = await insertPredictionInSupabase(base({ expectedByDate: PAST }));
    const resolved = await resolvePredictionInSupabase({
      memberId: MEMBER_ID, predictionId: created.id, status: "came_true", today: TODAY,
    });
    expect(resolved.status).toBe("came_true");
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
  });

  it("refuses to resolve before the expected-by date", async () => {
    const created = await insertPredictionInSupabase(base({ expectedByDate: FUTURE }));
    await expect(resolvePredictionInSupabase({
      memberId: MEMBER_ID, predictionId: created.id, status: "came_true", today: TODAY,
    })).rejects.toMatchObject({ reason: "not_yet" });
  });

  it("refuses to resolve twice", async () => {
    const created = await insertPredictionInSupabase(base({ expectedByDate: PAST }));
    await resolvePredictionInSupabase({ memberId: MEMBER_ID, predictionId: created.id, status: "came_true", today: TODAY });
    await expect(resolvePredictionInSupabase({
      memberId: MEMBER_ID, predictionId: created.id, status: "did_not_happen", today: TODAY,
    })).rejects.toMatchObject({ reason: "already_resolved" });
  });

  it("keeps the first outcome when two resolves race", async () => {
    const created = await insertPredictionInSupabase(base({ expectedByDate: PAST }));
    const results = await Promise.allSettled([
      resolvePredictionInSupabase({ memberId: MEMBER_ID, predictionId: created.id, status: "came_true", today: TODAY }),
      resolvePredictionInSupabase({ memberId: MEMBER_ID, predictionId: created.id, status: "did_not_happen", today: TODAY }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("will not let one member resolve another's prediction", async () => {
    const created = await insertPredictionInSupabase(base({ memberId: OTHER_MEMBER_ID, expectedByDate: PAST }));
    // Reported as missing rather than forbidden, so the response does not confirm the id exists.
    await expect(resolvePredictionInSupabase({
      memberId: MEMBER_ID, predictionId: created.id, status: "came_true", today: TODAY,
    })).rejects.toMatchObject({ reason: "missing" });

    const untouched = await listMemberPredictionsInSupabase(OTHER_MEMBER_ID);
    expect(untouched[0].status).toBe("pending");
  });

  it("reports an unknown id as missing", async () => {
    await expect(resolvePredictionInSupabase({
      memberId: MEMBER_ID, predictionId: "no-such-prediction", status: "came_true", today: TODAY,
    })).rejects.toMatchObject({ reason: "missing" });
  });
});
