import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import {
  getPractitionerDirectoryInSupabase,
  getPublishedReviewsInSupabase,
  getResolvedPredictionCountsInSupabase,
} from "@/lib/practitioners-supabase";
import { getPractitionerDirectory } from "@/lib/scheduling";
import { getPractitionerAccuracyMap, MIN_RESOLVED_FOR_PUBLIC_STAT } from "@/lib/predictions";

/**
 * Integration coverage for the practitioner directory, published reviews and the
 * prediction-accuracy stat. Skipped unless SUPABASE_DB_URL points at a reachable
 * database carrying the migration schema.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/practitioners-supabase.integration.test.ts
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const MEMBER_ID = "member-prac-itest";
// Ids no Firestore document could have, so a green assertion here cannot have
// come from the unported path.
const WITH_PORTAL = "prac-itest-portal";
const WITHOUT_PORTAL = "prac-itest-noportal";
const DEMO = "prac-itest-demo";
const ALL_PRACTITIONERS = [WITH_PORTAL, WITHOUT_PORTAL, DEMO];

async function cleanup() {
  await query(`delete from public.predictions where member_id = $1`, [MEMBER_ID]);
  await query(`delete from public.practitioner_reviews where practitioner_id = any($1::text[])`, [ALL_PRACTITIONERS]);
  await query(`delete from public.availability_rules where practitioner_id = any($1::text[])`, [ALL_PRACTITIONERS]);
  await query(`delete from public.practitioner_time_off where practitioner_id = any($1::text[])`, [ALL_PRACTITIONERS]);
  await query(`delete from public.practitioners where id = any($1::text[])`, [ALL_PRACTITIONERS]);
  await query(`delete from public.members where id = $1`, [MEMBER_ID]);
}

async function seedPractitioner(id: string, overrides: Record<string, string | null> = {}) {
  // A Map so an override replaces a base column instead of listing it twice —
  // Postgres rejects a repeated column in an insert list.
  const fields = new Map<string, string | null>([
    ["id", id],
    ["name", `Practitioner ${id.slice(-4)}`],
    ["slug", `slug-${id}`],
    ["email", `${id}@example.test`],
    ["active", "true"],
    ["is_demo_account", "false"],
    ["chat_rate_per_minute", "120.50"],
  ]);
  for (const [column, value] of Object.entries(overrides)) fields.set(column, value);
  const columns = [...fields.keys()];
  const values = [...fields.values()];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
  await query(
    `insert into public.practitioners (${columns.join(", ")}) values (${placeholders})
     on conflict (id) do update set name = excluded.name, active = excluded.active,
       is_demo_account = excluded.is_demo_account, firebase_uid = excluded.firebase_uid,
       has_portal_access = excluded.has_portal_access, chat_rate_per_minute = excluded.chat_rate_per_minute`,
    values,
  );
}

/** Inserts resolved predictions. Each value gets its own placeholder index derived
 * from the array length — reusing $1/$2 across row tuples while pushing more
 * values than the statement references is what produces
 * "bind message supplies N parameters, but prepared statement requires M". */
async function seedPredictions(entries: Array<[id: string, practitionerId: string, status: string]>) {
  const values: unknown[] = [MEMBER_ID];
  const rows = entries.map(([id, practitionerId, status]) => {
    values.push(practitionerId, status);
    return `('${id}', $1, $${values.length - 1}, $${values.length})`;
  });
  await query(
    `insert into public.predictions (id, member_id, practitioner_id, status) values ${rows.join(", ")}`,
    values,
  );
}

describeDb("the practitioner directory on Postgres", () => {
  beforeAll(async () => {
    await cleanup();
    await query(
      `insert into public.members (id, name, email) values ($1, $2, $3) on conflict (id) do nothing`,
      [MEMBER_ID, "Directory Member", "member-prac-itest@example.test"],
    );
    await seedPractitioner(WITH_PORTAL, { firebase_uid: "uid-has-portal" });
    await seedPractitioner(WITHOUT_PORTAL, { firebase_uid: null });
    await seedPractitioner(DEMO, { firebase_uid: null, is_demo_account: "true" });

    await query(
      `insert into public.availability_rules (id, practitioner_id, weekday, start_time, end_time)
       values ('rule-itest-1', $1, 3, '10:00', '12:00'), ('rule-itest-2', $1, 1, '09:00', '11:00')`,
      [WITH_PORTAL],
    );
    // One entry deliberately has no starts_at: Firestore documents written before
    // that field existed have none, which is why the column is nullable.
    await query(
      `insert into public.practitioner_time_off (id, practitioner_id, starts_at, ends_at, reason)
       values ('timeoff-itest-1', $1, null, now() + interval '5 days', 'No startsAt'),
              ('timeoff-itest-2', $1, now() + interval '1 day', now() + interval '2 days', 'Holiday')`,
      [WITHOUT_PORTAL],
    );
    // Already ended — must not come back in upcoming time off.
    await query(
      `insert into public.practitioner_time_off (id, practitioner_id, starts_at, ends_at, reason)
       values ('timeoff-itest-3', $1, now() - interval '10 days', now() - interval '5 days', 'Past')`,
      [WITHOUT_PORTAL],
    );
  });

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("excludes demo accounts and attaches rules ordered by weekday", async () => {
    const directory = await getPractitionerDirectoryInSupabase(true, false);
    const ids = directory.map((person) => person.id);
    expect(ids).toContain(WITH_PORTAL);
    expect(ids).toContain(WITHOUT_PORTAL);
    expect(ids).not.toContain(DEMO);

    const withRules = directory.find((person) => person.id === WITH_PORTAL);
    // Monday (1) before Wednesday (3) — the Firestore version ordered the same way.
    expect(withRules?.rules.map((rule) => rule.weekday)).toEqual([1, 3]);
    expect(typeof withRules?.rules[0]?.weekday).toBe("number");
  });

  it("includes demo accounts only when asked", async () => {
    const ids = (await getPractitionerDirectoryInSupabase(true, true)).map((person) => person.id);
    expect(ids).toContain(DEMO);
  });

  it("computes hasPortalAccess from firebaseUid rather than reading the column", async () => {
    // Plant a value in the column that contradicts firebase_uid. If the mapper
    // read the column, portal access would be granted to a practitioner who has
    // no Firebase account — and revoked from one who has.
    await query(`update public.practitioners set has_portal_access = true where id = $1`, [WITHOUT_PORTAL]);
    await query(`update public.practitioners set has_portal_access = false where id = $1`, [WITH_PORTAL]);

    const directory = await getPractitionerDirectoryInSupabase(true, false);
    expect(directory.find((p) => p.id === WITH_PORTAL)?.hasPortalAccess).toBe(true);
    expect(directory.find((p) => p.id === WITHOUT_PORTAL)?.hasPortalAccess).toBe(false);
  });

  it("returns the chat rate as a number, not the string node-postgres gives back", async () => {
    const directory = await getPractitionerDirectoryInSupabase(true, false);
    const person = directory.find((p) => p.id === WITH_PORTAL);
    // A string here reaches applyDiscount() and the discount concatenates.
    expect(typeof person?.chatRatePerMinute).toBe("number");
    expect(person?.chatRatePerMinute).toBeCloseTo(120.5);
    expect(typeof person?.experienceYears).toBe("number");
  });

  it("returns only upcoming time off, falling back to endsAt where startsAt is missing", async () => {
    const directory = await getPractitionerDirectoryInSupabase(true, false);
    const person = directory.find((p) => p.id === WITHOUT_PORTAL);
    expect(person?.timeOff).toHaveLength(2);
    expect(person?.timeOff.map((entry) => entry.id)).not.toContain("timeoff-itest-3");

    const withoutStart = person?.timeOff.find((entry) => entry.id === "timeoff-itest-1");
    expect(withoutStart?.startsAt).toBeInstanceOf(Date);
    expect(withoutStart?.startsAt.getTime()).toBe(withoutStart?.endsAt.getTime());
  });
});

describeDb("published reviews and prediction accuracy on Postgres", () => {
  beforeAll(async () => {
    await cleanup();
    await query(
      `insert into public.members (id, name, email) values ($1, $2, $3) on conflict (id) do nothing`,
      [MEMBER_ID, "Directory Member", "member-prac-itest@example.test"],
    );
    await seedPractitioner(WITH_PORTAL, { firebase_uid: "uid-has-portal" });
    await seedPractitioner(WITHOUT_PORTAL, { firebase_uid: null });
    await seedPractitioner(DEMO, { firebase_uid: null, is_demo_account: "true" });

    await query(
      `insert into public.practitioner_reviews
         (id, practitioner_id, member_id, reviewer_name, rating, clarity, empathy, usefulness, body, status)
       values ('rev-itest-1', $1, $2, 'Asha', 5, 4, 5, 4, 'Clear reading.', 'published'),
              ('rev-itest-2', $1, $2, 'Ravi', 3, 3, 4, 3, 'Okay.', 'published'),
              ('rev-itest-3', $1, $2, 'Hidden', 1, 1, 1, 1, 'Not published.', 'pending')`,
      [WITH_PORTAL, MEMBER_ID],
    );

    // WITH_PORTAL gets enough resolved predictions to clear the public threshold;
    // WITHOUT_PORTAL gets deliberately fewer.
    const statuses: Array<[string, string, string]> = [];
    for (let i = 0; i < MIN_RESOLVED_FOR_PUBLIC_STAT + 1; i += 1) {
      statuses.push([`pred-itest-a${i}`, WITH_PORTAL, i < 4 ? "came_true" : "did_not_happen"]);
    }
    for (let i = 0; i < 2; i += 1) {
      statuses.push([`pred-itest-b${i}`, WITHOUT_PORTAL, "came_true"]);
    }
    await seedPredictions(statuses);
  });

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("returns only published reviews, with numeric ratings", async () => {
    const reviews = await getPublishedReviewsInSupabase();
    const ids = reviews.map((review) => review.id);
    expect(ids).toContain("rev-itest-1");
    expect(ids).toContain("rev-itest-2");
    expect(ids).not.toContain("rev-itest-3");
    expect(typeof reviews[0]?.rating).toBe("number");
    expect(typeof reviews[0]?.clarity).toBe("number");
    expect(reviews[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("returns resolved counts as numbers, not the strings count() produces", async () => {
    const counts = await getResolvedPredictionCountsInSupabase();
    const entry = counts.get(WITH_PORTAL);
    // count() is int8 and arrives as a string; `resolved < 5` against a string is
    // always false, which would silently publish every practitioner's stat.
    expect(typeof entry?.resolved).toBe("number");
    expect(typeof entry?.accurate).toBe("number");
    expect(entry?.resolved).toBe(MIN_RESOLVED_FOR_PUBLIC_STAT + 1);
    expect(entry?.accurate).toBe(4);
  });
});

describeCutover("scheduling.ts and predictions.ts route to Postgres under cutover", () => {
  beforeAll(async () => {
    await cleanup();
    await query(
      `insert into public.members (id, name, email) values ($1, $2, $3) on conflict (id) do nothing`,
      [MEMBER_ID, "Directory Member", "member-prac-itest@example.test"],
    );
    await seedPractitioner(WITH_PORTAL, { firebase_uid: "uid-has-portal" });
    await seedPractitioner(WITHOUT_PORTAL, { firebase_uid: null });
    await seedPractitioner(DEMO, { firebase_uid: null, is_demo_account: "true" });
    const statuses: Array<[string, string, string]> = [];
    for (let i = 0; i < MIN_RESOLVED_FOR_PUBLIC_STAT + 1; i += 1) {
      statuses.push([`pred-itest-c${i}`, WITH_PORTAL, i < 5 ? "came_true" : "did_not_happen"]);
    }
    await seedPredictions(statuses);
  });

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("getPractitionerDirectory returns the Postgres practitioners", async () => {
    const directory = await getPractitionerDirectory(true, false);
    const ids = directory.map((person) => person.id);
    // These ids exist only in Postgres, so this cannot have come from Firestore.
    expect(ids).toContain(WITH_PORTAL);
    expect(ids).not.toContain(DEMO);
    expect(directory.find((p) => p.id === WITH_PORTAL)?.hasPortalAccess).toBe(true);
  });

  it("getPractitionerAccuracyMap applies the threshold and rounds the percentage", async () => {
    const map = await getPractitionerAccuracyMap();
    const entry = map.get(WITH_PORTAL);
    expect(entry?.resolvedCount).toBe(MIN_RESOLVED_FOR_PUBLIC_STAT + 1);
    // 5 accurate of 6 resolved = 83.33… → 83.
    expect(entry?.accuracyPercent).toBe(83);
  });
});
