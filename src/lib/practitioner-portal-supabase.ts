import "server-only";

import { randomUUID } from "node:crypto";

import { query, queryModel, queryModels, withTransaction } from "@/lib/postgres";
import type { BookingRow } from "@/lib/bookings-supabase";

// Data access for the practitioner self-service portal. Business rules, validation
// and every user-facing message stay in practitioner-portal.ts; this file only
// reads and writes rows, so the two providers cannot drift on wording.

// --- stats -------------------------------------------------------------------

export type PortalBookingTotals = {
  bookingEarned: number;
  completedCount: number;
  upcomingCount: number;
};

export type PortalStats = {
  totalEarned: number;
  completedCount: number;
  upcomingCount: number;
  paidOut: number;
  pendingOut: number;
  availableBalance: number;
  avgRating: number;
  reviewCount: number;
};

const STAT_NUMERIC_COLUMNS = ["bookingEarned", "completedCount", "upcomingCount"] as const;

/** Every booking aggregate the earnings page needs, in one pass over the
 * practitioner's bookings. The `filter (where …)` clauses mirror the three
 * separate conditions the Firestore loop applied, including the one that is easy
 * to lose: a member self-cancel flips `status` but not `payment_status`, so
 * earnings must exclude cancelled bookings *and* require paid, or a
 * cancelled-but-still-"paid" booking becomes payoutable money. */
async function bookingTotalsFor(practitionerId: string, now: Date): Promise<PortalBookingTotals> {
  const row = await queryModel<PortalBookingTotals>(
    `select coalesce(sum(service_price) filter (where payment_status = 'paid' and status <> 'cancelled'), 0) as booking_earned,
            count(*) filter (where status = 'completed') as completed_count,
            count(*) filter (where status in ('pending', 'confirmed') and scheduled_at >= $2) as upcoming_count
       from public.bookings
      where practitioner_id = $1`,
    [practitionerId, now],
    STAT_NUMERIC_COLUMNS,
  );
  return row ?? { bookingEarned: 0, completedCount: 0, upcomingCount: 0 };
}

/** Instant-chat revenue never touches `bookings`: endChatSession captures the
 * wallet hold straight onto the chat session. Summing only bookings would show a
 * practitioner who does paid chat work ₹0 of it, and they could never request a
 * payout against it. */
async function chatEarningsFor(practitionerId: string): Promise<number> {
  const row = await queryModel<{ earned: number }>(
    `select coalesce(sum(captured_amount), 0) as earned
       from public.chat_sessions
      where practitioner_id = $1 and status = 'ended'`,
    [practitionerId],
    ["earned"],
  );
  return row?.earned ?? 0;
}

async function reviewStatsFor(practitionerId: string): Promise<{ reviewCount: number; avgRating: number }> {
  const row = await queryModel<{ reviewCount: number; avgRating: number }>(
    `select count(*)::int as review_count, coalesce(avg(rating), 0) as avg_rating
       from public.practitioner_reviews
      where practitioner_id = $1 and status = 'published'`,
    [practitionerId],
    ["reviewCount", "avgRating"],
  );
  return row ?? { reviewCount: 0, avgRating: 0 };
}

async function payoutTotalsFor(practitionerId: string): Promise<{ paidOut: number; pendingOut: number }> {
  const row = await queryModel<{ paidOut: number; pendingOut: number }>(
    `select coalesce(sum(amount) filter (where status = 'paid'), 0) as paid_out,
            coalesce(sum(amount) filter (where status in ('requested', 'approved')), 0) as pending_out
       from public.practitioner_payouts
      where practitioner_id = $1`,
    [practitionerId],
    ["paidOut", "pendingOut"],
  );
  return row ?? { paidOut: 0, pendingOut: 0 };
}

export async function getPortalStatsInSupabase(practitionerId: string): Promise<PortalStats> {
  const now = new Date();
  const [bookings, chatEarned, reviews, { paidOut, pendingOut }] = await Promise.all([
    bookingTotalsFor(practitionerId, now),
    chatEarningsFor(practitionerId),
    reviewStatsFor(practitionerId),
    payoutTotalsFor(practitionerId),
  ]);

  const totalEarned = chatEarned + bookings.bookingEarned;
  // Rounded in TypeScript, not in SQL: round(avg, 1) and Math.round(x * 10) / 10
  // differ on .x5 values (Postgres rounds half away from zero on the exact
  // decimal, JavaScript on the binary double), and the Firestore path used the
  // JavaScript form.
  const avgRating = reviews.reviewCount ? Math.round(reviews.avgRating * 10) / 10 : 0;

  return {
    totalEarned,
    completedCount: bookings.completedCount,
    upcomingCount: bookings.upcomingCount,
    paidOut,
    pendingOut,
    availableBalance: Math.max(0, totalEarned - paidOut - pendingOut),
    avgRating,
    reviewCount: reviews.reviewCount,
  };
}

// --- bookings & reviews ------------------------------------------------------

const PORTAL_BOOKING_COLUMNS = `
  id, reference, service_id, service_title, service_price, service_duration, practitioner_id,
  practitioner_name, client_name, client_email::text as client_email, client_phone, birth_date,
  birth_time, birth_place, scheduled_at, notes, status, payment_status, kundli_summary,
  kundli_generated_at, varshphal_summary, varshphal_year, varshphal_generated_at, created_at, updated_at`;

const BOOKING_NUMERIC_COLUMNS = ["servicePrice", "serviceDuration", "varshphalYear"] as const;

export async function getPortalBookingsInSupabase(practitionerId: string): Promise<BookingRow[]> {
  return queryModels<BookingRow>(
    `select ${PORTAL_BOOKING_COLUMNS}
       from public.bookings
      where practitioner_id = $1
      order by scheduled_at desc`,
    [practitionerId],
    BOOKING_NUMERIC_COLUMNS,
  );
}

export async function getPortalBookingInSupabase(bookingId: string): Promise<BookingRow | null> {
  return queryModel<BookingRow>(
    `select ${PORTAL_BOOKING_COLUMNS} from public.bookings where id = $1`,
    [bookingId],
    BOOKING_NUMERIC_COLUMNS,
  );
}

export async function cacheBookingKundliInSupabase(bookingId: string, summary: string): Promise<BookingRow | null> {
  return queryModel<BookingRow>(
    `update public.bookings
        set kundli_summary = $2, kundli_generated_at = now(), updated_at = now()
      where id = $1
      returning ${PORTAL_BOOKING_COLUMNS}`,
    [bookingId, summary],
    BOOKING_NUMERIC_COLUMNS,
  );
}

export async function cacheBookingVarshphalInSupabase(bookingId: string, summary: string, year: number): Promise<BookingRow | null> {
  return queryModel<BookingRow>(
    `update public.bookings
        set varshphal_summary = $2, varshphal_year = $3, varshphal_generated_at = now(), updated_at = now()
      where id = $1
      returning ${PORTAL_BOOKING_COLUMNS}`,
    [bookingId, summary, year],
    BOOKING_NUMERIC_COLUMNS,
  );
}

// --- chat-session report cache ----------------------------------------------

export type PortalChatSession = {
  id: string;
  practitionerId: string;
  memberId: string;
  kundliSummary: string | null;
  varshphalSummary: string | null;
  varshphalYear: number | null;
};

export async function getPortalChatSessionInSupabase(sessionId: string): Promise<PortalChatSession | null> {
  return queryModel<PortalChatSession>(
    `select id, practitioner_id, member_id, kundli_summary, varshphal_summary, varshphal_year
       from public.chat_sessions
      where id = $1`,
    [sessionId],
    ["varshphalYear"],
  );
}

export async function cacheChatKundliInSupabase(sessionId: string, summary: string): Promise<void> {
  await query(
    `update public.chat_sessions
        set kundli_summary = $2, kundli_generated_at = now(), updated_at = now()
      where id = $1`,
    [sessionId, summary],
  );
}

export async function cacheChatVarshphalInSupabase(sessionId: string, summary: string, year: number): Promise<void> {
  await query(
    `update public.chat_sessions
        set varshphal_summary = $2, varshphal_year = $3, varshphal_generated_at = now(), updated_at = now()
      where id = $1`,
    [sessionId, summary, year],
  );
}

export type PortalMemberBirthProfile = {
  name: string;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
};

/** A chat session does not capture birth details at checkout the way a booking
 * does, so the report engines read them off the client's own member profile. */
export async function getPortalMemberBirthProfileInSupabase(memberId: string): Promise<PortalMemberBirthProfile | null> {
  return queryModel<PortalMemberBirthProfile>(
    `select name, birth_date, birth_time, birth_place from public.members where id = $1`,
    [memberId],
  );
}

// --- schedule ----------------------------------------------------------------

export type PortalScheduleRule = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  active: boolean;
};

export type PortalTimeOff = {
  id: string;
  reason: string | null;
  startsAt: Date;
  endsAt: Date;
};

export async function getPortalScheduleInSupabase(practitionerId: string): Promise<{
  rules: PortalScheduleRule[];
  timeOff: PortalTimeOff[];
}> {
  const [rules, rawTimeOff] = await Promise.all([
    queryModels<Omit<PortalScheduleRule, "weekday"> & { weekday: number }>(
      `select id, weekday::int as weekday, start_time, end_time, active
         from public.availability_rules
        where practitioner_id = $1
        order by weekday asc`,
      [practitionerId],
      ["weekday"],
    ),
    queryModels<{ id: string; reason: string | null; startsAt: Date | null; endsAt: Date }>(
      `select id, reason, starts_at, ends_at
         from public.practitioner_time_off
        where practitioner_id = $1 and ends_at >= $2`,
      [practitionerId, new Date()],
    ),
  ]);

  // starts_at is nullable: documents written before the field existed have none,
  // and the Firestore reader's toDate() fell back to "now" for them. Keeping that
  // fallback here rather than adopting scheduling.ts's endsAt fallback, because
  // the two paths sort differently and this one has shipped as-is.
  const timeOff: PortalTimeOff[] = rawTimeOff
    .map((row) => ({ id: row.id, reason: row.reason, startsAt: row.startsAt ?? new Date(), endsAt: row.endsAt }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return { rules, timeOff };
}

export type PortalScheduleRuleInput = { weekday: number; startTime: string; endTime: string; active: boolean };
export type PortalTimeOffInput = { startsAt: Date; endsAt: Date; reason: string | null };

/** Replaces a practitioner's whole schedule in one transaction.
 *
 * The advisory lock is not redundant with the transaction. Two concurrent saves —
 * a double-click, or the schedule page open in two tabs — would otherwise both
 * delete what they can see and then both insert, committing two disjoint sets of
 * rows and leaving the practitioner with duplicated, conflicting rules. A
 * plain transaction gives no serialisation here: the two DELETEs touch the same
 * existing rows but neither blocks the other's INSERT of brand-new ids. The lock
 * is keyed per practitioner so different practitioners never contend.
 */
export async function replacePortalScheduleInSupabase(
  practitionerId: string,
  rules: PortalScheduleRuleInput[],
  timeOff: PortalTimeOffInput[],
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`practitioner-schedule:${practitionerId}`]);
    await client.query("delete from public.availability_rules where practitioner_id = $1", [practitionerId]);
    await client.query("delete from public.practitioner_time_off where practitioner_id = $1", [practitionerId]);

    if (rules.length) {
      const values: unknown[] = [];
      const tuples = rules.map((rule) => {
        const base = values.length;
        values.push(randomUUID(), practitionerId, rule.weekday, rule.startTime, rule.endTime, rule.active);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
      });
      await client.query(
        `insert into public.availability_rules (id, practitioner_id, weekday, start_time, end_time, active)
         values ${tuples.join(", ")}`,
        values,
      );
    }

    if (timeOff.length) {
      const values: unknown[] = [];
      const tuples = timeOff.map((item) => {
        const base = values.length;
        values.push(randomUUID(), practitionerId, item.reason, item.startsAt, item.endsAt);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      });
      await client.query(
        `insert into public.practitioner_time_off (id, practitioner_id, reason, starts_at, ends_at)
         values ${tuples.join(", ")}`,
        values,
      );
    }
  });
}

// --- profile -----------------------------------------------------------------

export type PortalProfilePatch = Partial<{
  bio: string;
  specialties: string;
  languages: string;
  consultationModes: string;
  photoUrl: string | null;
  videoUrl: string | null;
}>;

export type PortalPractitionerRow = {
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
  createdAt: Date;
  updatedAt: Date;
};

const PRACTITIONER_COLUMNS = `
  id, name, slug, email::text as email, title, bio, specialties, languages, consultation_modes,
  experience_years, verified, verification_level, photo_url, video_url, online, is_ai_powered,
  chat_rate_per_minute, active, featured, is_demo_account, firebase_uid, created_at, updated_at`;

const PRACTITIONER_NUMERIC_COLUMNS = ["experienceYears", "chatRatePerMinute"] as const;

/** Column-name whitelist so a caller can never widen what this writes by adding
 * a key to the patch object. */
const PROFILE_COLUMNS: Record<keyof PortalProfilePatch, string> = {
  bio: "bio",
  specialties: "specialties",
  languages: "languages",
  consultationModes: "consultation_modes",
  photoUrl: "photo_url",
  videoUrl: "video_url",
};

export async function updatePortalProfileInSupabase(
  practitionerId: string,
  patch: PortalProfilePatch,
): Promise<PortalPractitionerRow | null> {
  const assignments: string[] = [];
  const values: unknown[] = [practitionerId];
  for (const [key, column] of Object.entries(PROFILE_COLUMNS) as Array<[keyof PortalProfilePatch, string]>) {
    const value = patch[key];
    if (value === undefined) continue;
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }
  assignments.push("updated_at = now()");

  return queryModel<PortalPractitionerRow>(
    `update public.practitioners
        set ${assignments.join(", ")}
      where id = $1
      returning ${PRACTITIONER_COLUMNS}`,
    values,
    PRACTITIONER_NUMERIC_COLUMNS,
  );
}

export async function setPortalOnlineInSupabase(practitionerId: string, online: boolean): Promise<void> {
  await query(
    "update public.practitioners set online = $2, updated_at = now() where id = $1",
    [practitionerId, online],
  );
}

// --- payout details & verification -------------------------------------------

export type PortalPractitionerLite = {
  name: string;
  email: string;
  bankAccountName: string | null;
  bankAccountNumberEnc: string | null;
  bankIfsc: string | null;
  upiIdEnc: string | null;
};

/** One query for the whole admin payout list. The Firestore path fanned out one
 * document read per distinct practitioner on every page load. */
export async function getPortalPractitionerLitesInSupabase(practitionerIds: string[]): Promise<Map<string, PortalPractitionerLite>> {
  const map = new Map<string, PortalPractitionerLite>();
  if (!practitionerIds.length) return map;
  const rows = await queryModels<PortalPractitionerLite & { id: string }>(
    `select id, name, email::text as email, bank_account_name, bank_account_number_enc, bank_ifsc, upi_id_enc
       from public.practitioners
      where id = any($1::text[])`,
    [practitionerIds],
  );
  for (const row of rows) {
    map.set(row.id, {
      name: row.name,
      email: row.email,
      bankAccountName: row.bankAccountName,
      bankAccountNumberEnc: row.bankAccountNumberEnc,
      bankIfsc: row.bankIfsc,
      upiIdEnc: row.upiIdEnc,
    });
  }
  return map;
}

export type PortalPayoutFieldSource = {
  id: string;
  bankAccountNumberEnc: string | null;
  upiIdEnc: string | null;
};

/** Demo accounts are excluded in SQL because their fixture payout details would
 * otherwise collide with each other and flag real practitioners by association. */
export async function getPayoutFieldSourcesInSupabase(): Promise<PortalPayoutFieldSource[]> {
  return queryModels<PortalPayoutFieldSource>(
    `select id, bank_account_number_enc, upi_id_enc
       from public.practitioners
      where coalesce(is_demo_account, false) = false`,
    [],
  );
}

export async function updatePortalPayoutDetailsInSupabase(
  practitionerId: string,
  input: { bankAccountName: string | null; bankAccountNumberEnc: string | null; bankIfsc: string | null; upiIdEnc: string | null },
): Promise<void> {
  const assignments: string[] = [];
  const values: unknown[] = [practitionerId];
  for (const [key, column] of [
    ["bankAccountName", "bank_account_name"],
    ["bankAccountNumberEnc", "bank_account_number_enc"],
    ["bankIfsc", "bank_ifsc"],
    ["upiIdEnc", "upi_id_enc"],
  ] as const) {
    const value = input[key];
    if (value === null) continue;
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }
  // payoutDetailsUpdatedAt is always written, even when no field changed: it is
  // what starts the 72-hour auto-approval cooldown, and "touched the payout form"
  // is the event that has to be cooled down from.
  assignments.push("payout_details_updated_at = now()", "updated_at = now()");

  await query(
    `update public.practitioners set ${assignments.join(", ")} where id = $1`,
    values,
  );
}
