import "server-only";

import { GENUINE_REVIEW_SQL } from "@/lib/review-provenance";
import { isUniqueViolation, query, queryModel, queryModels, withTransaction } from "@/lib/postgres";

/**
 * Postgres data access behind the practitioner directory, the published reviews
 * and the prediction-accuracy stat.
 *
 * Data-only, same split as the other twins: the demo-account filtering rule, the
 * MIN_RESOLVED_FOR_PUBLIC_STAT threshold and the review scoring all stay in
 * scheduling.ts / predictions.ts / marketplace.ts. This module just returns rows.
 *
 * Two deliberate choices worth knowing before you change anything here:
 *
 * 1. hasPortalAccess is COMPUTED from firebaseUid, not read from the column of
 *    that name. practitionerFromDoc() in scheduling.ts has always derived it, and
 *    Firestore documents carry no hasPortalAccess field — so the copied column is
 *    false for every practitioner. Reading it would silently revoke portal access
 *    from every practitioner at cutover. The column exists for a future migration
 *    to populate; do not read it until then.
 *
 * 2. The directory is three queries, not one per practitioner. The Firestore
 *    version did a subcollection read per practitioner; against Postgres that is
 *    an N+1 round trip for a page every visitor loads. Rows are grouped in JS.
 */

/** Mirrors Practitioner in scheduling.ts. */
export type PractitionerRow = {
  id: string;
  name: string;
  slug: string;
  email: string;
  title: string;
  bio: string;
  specialties: string;
  languages: string;
  consultationModes: string;
  experienceYears: number;
  verified: boolean;
  verificationLevel: string;
  photoUrl: string | null;
  videoUrl: string | null;
  online: boolean;
  isAiPowered: boolean;
  chatRatePerMinute: number;
  active: boolean;
  featured: boolean;
  isDemoAccount: boolean;
  firebaseUid: string | null;
  hasPortalAccess: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AvailabilityRuleRow = {
  id: string;
  practitionerId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  active: boolean;
};

export type TimeOffRow = {
  id: string;
  practitionerId: string;
  reason: string | null;
  /** Nullable: Firestore documents written before this field existed have none.
   * The caller falls back to endsAt, exactly as the Firestore path did. */
  startsAt: Date | null;
  endsAt: Date;
};

/** Time off after the startsAt fallback has been applied — never null here, which
 * is what PractitionerTimeOff in scheduling.ts requires. */
export type ResolvedTimeOffRow = Omit<TimeOffRow, "startsAt"> & { startsAt: Date };

export type PractitionerWithScheduleRow = PractitionerRow & {
  rules: AvailabilityRuleRow[];
  timeOff: ResolvedTimeOffRow[];
};

/** chat_rate_per_minute is numeric(14,2), which node-postgres returns as a string.
 * Without this it reaches applyDiscount() as a string and the discount calculation
 * concatenates instead of subtracting. */
const PRACTITIONER_NUMERIC_COLUMNS = ["experienceYears", "chatRatePerMinute"] as const;

const PRACTITIONER_SELECT = `
  select id, name, slug, email::text as email, title, bio, specialties, languages,
         consultation_modes, experience_years, verified, verification_level,
         photo_url, video_url, online, is_ai_powered, chat_rate_per_minute,
         active, featured, is_demo_account, firebase_uid,
         last_login_at, created_at, updated_at
    from public.practitioners`;

export async function getPractitionersInSupabase(activeOnly: boolean, includeDemo: boolean): Promise<PractitionerRow[]> {
  // isDemoAccount is filtered in SQL here rather than in JS as the Firestore path
  // had to: Firestore's `!=` drops documents where the field is absent entirely,
  // which would have excluded every real practitioner. Postgres has no such trap,
  // and the column is NOT NULL DEFAULT false, so `= false` is exact.
  const clauses: string[] = [];
  if (activeOnly) clauses.push("active = true");
  if (!includeDemo) clauses.push("is_demo_account = false");
  const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";

  const rows = await queryModels<Omit<PractitionerRow, "hasPortalAccess">>(
    `${PRACTITIONER_SELECT}${where} order by name asc`,
    [],
    PRACTITIONER_NUMERIC_COLUMNS,
  );
  // email is citext; the ::text cast above keeps it a plain string for callers.
  return rows.map((row) => ({ ...row, hasPortalAccess: row.firebaseUid !== null }));
}

export async function getPractitionerByIdInSupabase(id: string): Promise<PractitionerRow | null> {
  const row = await queryModel<Omit<PractitionerRow, "hasPortalAccess">>(
    `${PRACTITIONER_SELECT} where id = $1`,
    [id],
    PRACTITIONER_NUMERIC_COLUMNS,
  );
  return row ? { ...row, hasPortalAccess: row.firebaseUid !== null } : null;
}

/** Thrown for a duplicate email; the unique index enforces it, which also settles a race. */
export class PractitionerEmailTakenError extends Error {}

export type PractitionerInsert = Omit<PractitionerRow,
  "id" | "isDemoAccount" | "firebaseUid" | "hasPortalAccess" | "lastLoginAt" | "createdAt" | "updatedAt">;

const WRITABLE_COLUMNS: Record<keyof PractitionerInsert, string> = {
  name: "name", slug: "slug", email: "email", title: "title", bio: "bio", specialties: "specialties",
  languages: "languages", consultationModes: "consultation_modes", experienceYears: "experience_years",
  verified: "verified", verificationLevel: "verification_level", photoUrl: "photo_url", videoUrl: "video_url",
  online: "online", isAiPowered: "is_ai_powered", chatRatePerMinute: "chat_rate_per_minute",
  active: "active", featured: "featured",
};

function emailConflict(error: unknown) {
  return isUniqueViolation(error) && String((error as { constraint?: string }).constraint).includes("email");
}

/**
 * Inserts a practitioner, trying `${slug}`, `${slug}-2`, … until one is free, with optional
 * weekday hours written in the same transaction so a practitioner never exists half-created.
 */
export async function insertPractitionerInSupabase(
  input: PractitionerInsert,
  starterWeekdays: number[] = [],
): Promise<string> {
  const keys = Object.keys(WRITABLE_COLUMNS) as Array<keyof PractitionerInsert>;
  for (let attempt = 0; attempt < 22; attempt += 1) {
    const slug = attempt === 0 ? input.slug : `${input.slug}-${attempt + 1}`;
    const values = keys.map((key) => (key === "slug" ? slug : input[key]));
    try {
      return await withTransaction(async (client) => {
        await client.query(
          `insert into public.practitioners (id, ${keys.map((key) => WRITABLE_COLUMNS[key]).join(", ")})
           values ($1, ${keys.map((_, index) => `$${index + 2}`).join(", ")})`,
          [slug, ...values],
        );
        for (const weekday of starterWeekdays) {
          await client.query(
            `insert into public.availability_rules (id, practitioner_id, weekday, start_time, end_time, active)
             values ($1, $2, $3, '09:30', '17:30', true)`,
            [`${slug}_starter-${weekday}`, slug, weekday],
          );
        }
        return slug;
      });
    } catch (error) {
      if (emailConflict(error)) throw new PractitionerEmailTakenError("A practitioner with that email already exists.");
      if (!isUniqueViolation(error)) throw error;
      // The id or slug is taken: try the next suffix.
    }
  }
  throw new Error("Could not generate a unique profile URL.");
}

/** Updates the given fields. False when there is no such practitioner. */
export async function updatePractitionerInSupabase(id: string, patch: Partial<PractitionerInsert>): Promise<boolean> {
  const keys = (Object.keys(patch) as Array<keyof PractitionerInsert>).filter((key) => key in WRITABLE_COLUMNS && key !== "slug");
  const sets = keys.map((key, index) => `${WRITABLE_COLUMNS[key]} = $${index + 2}`);
  try {
    const result = await query(
      `update public.practitioners set ${[...sets, "updated_at = now()"].join(", ")} where id = $1`,
      [id, ...keys.map((key) => patch[key])],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    if (emailConflict(error)) throw new PractitionerEmailTakenError("That email belongs to another practitioner.");
    throw error;
  }
}

/**
 * Deletes a practitioner with no bookings or reviews; their hours and time off go with them by
 * cascade. Reviews also cascade in this schema, so the check is what stops a delete from taking a
 * practitioner's review history with it.
 */
export async function deleteUnusedPractitionerInSupabase(id: string): Promise<"deleted" | "not_found" | "has_history"> {
  return withTransaction(async (client) => {
    const found = await client.query(`select 1 from public.practitioners where id = $1 for update`, [id]);
    if (!found.rowCount) return "not_found";
    const history = await client.query(
      `select exists (select 1 from public.bookings where practitioner_id = $1)
           or exists (select 1 from public.practitioner_reviews where practitioner_id = $1) as used`,
      [id],
    );
    if (history.rows[0]?.used) return "has_history";
    await client.query(`delete from public.practitioners where id = $1`, [id]);
    return "deleted";
  });
}

/** The minimum the booking flow needs to confirm an astrologer can take a reading. */
export type PractitionerAvailabilityRow = { id: string; name: string; active: boolean; isAiPowered: boolean };

/**
 * One practitioner by id, or null.
 *
 * Booking creation asks for exactly this and nothing more — pulling the whole
 * PractitionerRow would fetch a dozen columns the caller discards. The caller
 * still owns the `active` check, so a deactivated practitioner is a 404 from the
 * route rather than a silent refusal here.
 */
export async function getPractitionerAvailabilityInSupabase(id: string): Promise<PractitionerAvailabilityRow | null> {
  return queryModel<PractitionerAvailabilityRow>(
    `select id, name, active, is_ai_powered from public.practitioners where id = $1`,
    [id],
  );
}

/** What the chat and PDF surfaces need about a practitioner: who they are and
 * whether they are an AI persona rather than a human astrologer. */
export type PractitionerAttributionRow = { name: string; photoUrl: string | null; isAiPowered: boolean };

/**
 * One practitioner's display and attribution details, or null.
 *
 * isAiPowered decides how a generated PDF is attributed — naming an AI persona as
 * a human astrologer would misrepresent who produced the reading — so it travels
 * with the name rather than being fetched separately.
 */
export async function getPractitionerAttributionInSupabase(id: string): Promise<PractitionerAttributionRow | null> {
  return queryModel<PractitionerAttributionRow>(
    `select name, photo_url, is_ai_powered from public.practitioners where id = $1`,
    [id],
  );
}

export async function getAvailabilityRulesInSupabase(practitionerIds: string[]): Promise<AvailabilityRuleRow[]> {
  if (!practitionerIds.length) return [];
  return queryModels<AvailabilityRuleRow>(
    `select id, practitioner_id, weekday::int as weekday, start_time, end_time, active
       from public.availability_rules
      where practitioner_id = any($1::text[])
      order by practitioner_id, weekday asc, start_time asc`,
    [practitionerIds],
    ["weekday"],
  );
}

export async function getUpcomingTimeOffInSupabase(practitionerIds: string[], from: Date): Promise<TimeOffRow[]> {
  if (!practitionerIds.length) return [];
  return queryModels<TimeOffRow>(
    `select id, practitioner_id, reason, starts_at, ends_at
       from public.practitioner_time_off
      where practitioner_id = any($1::text[]) and ends_at >= $2
      order by practitioner_id, ends_at asc`,
    [practitionerIds, from],
  );
}

/** The directory with each practitioner's rules and upcoming time off attached. */
export async function getPractitionerDirectoryInSupabase(
  activeOnly: boolean,
  includeDemo: boolean,
  from = new Date(),
): Promise<PractitionerWithScheduleRow[]> {
  const people = await getPractitionersInSupabase(activeOnly, includeDemo);
  if (!people.length) return [];

  const ids = people.map((person) => person.id);
  const [rules, timeOff] = await Promise.all([
    getAvailabilityRulesInSupabase(ids),
    getUpcomingTimeOffInSupabase(ids, from),
  ]);

  const rulesByPractitioner = new Map<string, AvailabilityRuleRow[]>();
  for (const rule of rules) {
    const list = rulesByPractitioner.get(rule.practitionerId) ?? [];
    list.push(rule);
    rulesByPractitioner.set(rule.practitionerId, list);
  }
  const timeOffByPractitioner = new Map<string, TimeOffRow[]>();
  for (const entry of timeOff) {
    const list = timeOffByPractitioner.get(entry.practitionerId) ?? [];
    list.push(entry);
    timeOffByPractitioner.set(entry.practitionerId, list);
  }

  return people.map((person) => ({
    ...person,
    rules: rulesByPractitioner.get(person.id) ?? [],
    // Firestore documents written before startsAt existed carry none; the app has
    // always shown endsAt in that case.
    timeOff: (timeOffByPractitioner.get(person.id) ?? []).map((entry) => ({
      ...entry,
      startsAt: entry.startsAt ?? entry.endsAt,
    })),
  }));
}

/** Mirrors PractitionerReview in marketplace.ts. */
export type ReviewRow = {
  id: string;
  practitionerId: string;
  memberId: string | null;
  bookingId: string | null;
  reviewerName: string;
  rating: number;
  clarity: number;
  empathy: number;
  usefulness: number;
  body: string;
  status: string;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const REVIEW_SELECT = `
  select id, practitioner_id, member_id, booking_id, reviewer_name,
         rating::int as rating, clarity::int as clarity, empathy::int as empathy,
         usefulness::int as usefulness, body, status, source, created_at, updated_at
    from public.practitioner_reviews`;

const REVIEW_NUMERIC_COLUMNS = ["rating", "clarity", "empathy", "usefulness"] as const;

export async function getPublishedReviewsInSupabase(): Promise<ReviewRow[]> {
  return queryModels<ReviewRow>(
    `${REVIEW_SELECT} where status = 'published' and ${GENUINE_REVIEW_SQL} order by created_at desc`,
    [],
    REVIEW_NUMERIC_COLUMNS,
  );
}

export async function getPublishedReviewsForPractitionerInSupabase(practitionerId: string): Promise<ReviewRow[]> {
  return queryModels<ReviewRow>(
    `${REVIEW_SELECT} where practitioner_id = $1 and status = 'published' and ${GENUINE_REVIEW_SQL} order by created_at desc`,
    [practitionerId],
    REVIEW_NUMERIC_COLUMNS,
  );
}

export async function getAllReviewsInSupabase(): Promise<ReviewRow[]> {
  return queryModels<ReviewRow>(`${REVIEW_SELECT} order by created_at desc`, [], REVIEW_NUMERIC_COLUMNS);
}

const REVIEW_RETURNING = `returning id, practitioner_id, member_id, booking_id, reviewer_name,
  rating::int as rating, clarity::int as clarity, empathy::int as empathy,
  usefulness::int as usefulness, body, status, source, created_at, updated_at`;

/** Admin moderation. Null when the review is gone. */
export async function setReviewStatusInSupabase(id: string, status: string): Promise<ReviewRow | null> {
  return queryModel<ReviewRow>(
    `update public.practitioner_reviews set status = $2, updated_at = now() where id = $1 ${REVIEW_RETURNING}`,
    [id, status],
    REVIEW_NUMERIC_COLUMNS,
  );
}

/** The deleted review's practitioner, or null when there was nothing to delete. */
export async function deleteReviewInSupabase(id: string): Promise<{ practitionerId: string } | null> {
  return queryModel<{ practitionerId: string }>(
    `delete from public.practitioner_reviews where id = $1 returning practitioner_id`,
    [id],
  );
}

export type MemberReviewInsert = {
  practitionerId: string;
  memberId: string;
  bookingId: string;
  reviewerName: string;
  rating: number;
  clarity: number;
  empathy: number;
  usefulness: number;
  body: string;
  status: string;
  source: string;
};

/**
 * One review per booking: the id is the booking id, as it is in Firestore (whose create() failed
 * if the document existed), so a second submit — or two racing — inserts nothing. Null then.
 */
export async function insertMemberReviewInSupabase(input: MemberReviewInsert): Promise<ReviewRow | null> {
  return queryModel<ReviewRow>(
    `insert into public.practitioner_reviews
       (id, practitioner_id, member_id, booking_id, reviewer_name, rating, clarity, empathy, usefulness, body, status, source)
     values ($1, $2, $3, $1, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (id) do nothing
     ${REVIEW_RETURNING}`,
    [input.bookingId, input.practitionerId, input.memberId, input.reviewerName, input.rating, input.clarity,
      input.empathy, input.usefulness, input.body, input.status, input.source],
    REVIEW_NUMERIC_COLUMNS,
  );
}

/** Practitioner names/slugs for the admin review list, in one query. */
export async function getPractitionerNameMapInSupabase(practitionerIds: string[]): Promise<Map<string, { name: string; slug: string }>> {
  if (!practitionerIds.length) return new Map();
  const result = await query<{ id: string; name: string; slug: string }>(
    `select id, name, slug from public.practitioners where id = any($1::text[])`,
    [practitionerIds],
  );
  return new Map(result.rows.map((row) => [row.id, { name: row.name, slug: row.slug }]));
}

/** Raw resolved-prediction counts per practitioner. The MIN_RESOLVED threshold and
 * the rounding stay in predictions.ts, which owns that rule.
 *
 * count() returns int8, which node-postgres hands back as a STRING. The ::int
 * casts are what make these real numbers — without them `resolved < 5` compares a
 * string and every practitioner is silently filtered out. */
export async function getResolvedPredictionCountsInSupabase(): Promise<Map<string, { resolved: number; accurate: number }>> {
  const result = await query<{ practitionerId: string; resolved: number; accurate: number }>(
    `select practitioner_id as "practitionerId",
            count(*)::int as resolved,
            count(*) filter (where status = 'came_true')::int as accurate
       from public.predictions
      where status in ('came_true', 'did_not_happen') and practitioner_id is not null
      group by practitioner_id`,
  );
  return new Map(result.rows.map((row) => [row.practitionerId, { resolved: row.resolved, accurate: row.accurate }]));
}
