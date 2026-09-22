import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import {
  cacheBookingKundliInSupabase,
  cacheBookingVarshphalInSupabase,
  cacheChatKundliInSupabase,
  cacheChatVarshphalInSupabase,
  getPayoutFieldSourcesInSupabase,
  getPortalBookingInSupabase,
  getPortalBookingsInSupabase,
  getPortalChatSessionInSupabase,
  getPortalMemberBirthProfileInSupabase,
  getPortalPractitionerLitesInSupabase,
  getPortalScheduleInSupabase,
  getPortalStatsInSupabase,
  replacePortalScheduleInSupabase,
  setPortalOnlineInSupabase,
  updatePortalPayoutDetailsInSupabase,
  updatePortalProfileInSupabase,
} from "@/lib/practitioner-portal-supabase";

process.env.PAYOUT_ENCRYPTION_KEY = process.env.PAYOUT_ENCRYPTION_KEY || "portal-itest-encryption-key-0123456789";

vi.mock("@/lib/admin-roles", () => ({ getAdminIdsWithPermission: async () => [] }));
vi.mock("@/lib/notifications", () => ({ notifyAdmins: async () => undefined }));

// The chart engines are pure CPU and slow, and their output is already covered by
// astro-engine-swiss.test.ts. Replaced here so these tests exercise the fetch,
// authorisation and cache logic instead of ephemeris maths. The error classes stay
// real classes, because practitioner-portal.ts branches on `instanceof`.
const engine = vi.hoisted(() => ({
  buildKundliChart: vi.fn(),
  renderKundliReport: vi.fn(),
  KundliEngineError: class KundliEngineError extends Error {},
  buildVarshphalChart: vi.fn(),
  renderVarshphalReport: vi.fn(),
  VarshphalError: class VarshphalError extends Error {},
}));
vi.mock("@/lib/kundli-engine", () => ({
  buildKundliChart: engine.buildKundliChart,
  renderKundliReport: engine.renderKundliReport,
  KundliEngineError: engine.KundliEngineError,
}));
vi.mock("@/lib/varshphal", () => ({
  buildVarshphalChart: engine.buildVarshphalChart,
  renderVarshphalReport: engine.renderVarshphalReport,
  VarshphalError: engine.VarshphalError,
}));

import {
  getBookingKundliSummary,
  getBookingVarshphalSummary,
  getChatMemberKundliSummary,
  KundliSummaryError,
  ScheduleError,
  updatePractitionerSchedule,
} from "@/lib/practitioner-portal";

/**
 * Integration coverage for the practitioner portal data layer and the gated
 * portal actions. Skipped unless SUPABASE_DB_URL points at a reachable database
 * carrying the migration schema.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/practitioner-portal.integration.test.ts
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const P = "portal-itest-prac";
const OTHER = "portal-itest-other";
const DEMO = "portal-itest-demo";
const MEMBER = "portal-itest-member";
const SERVICE = "portal-itest-service";
const PRACTITIONER_IDS = [P, OTHER, DEMO];

const DAY = 24 * 60 * 60 * 1000;
const THIS_YEAR = new Date().getFullYear();

async function cleanup() {
  await query(`delete from public.availability_rules where practitioner_id = any($1::text[])`, [PRACTITIONER_IDS]);
  await query(`delete from public.practitioner_time_off where practitioner_id = any($1::text[])`, [PRACTITIONER_IDS]);
  await query(`delete from public.practitioner_payouts where practitioner_id = any($1::text[])`, [PRACTITIONER_IDS]);
  await query(`delete from public.practitioner_reviews where practitioner_id = any($1::text[])`, [PRACTITIONER_IDS]);
  await query(`delete from public.chat_sessions where member_id = $1`, [MEMBER]);
  await query(`delete from public.bookings where id like $1`, ["portal-itest-%"]);
  await query(`delete from public.practitioners where id = any($1::text[])`, [PRACTITIONER_IDS]);
  await query(`delete from public.services where id = $1`, [SERVICE]);
  await query(`delete from public.members where id = $1`, [MEMBER]);
}

type BookingOverrides = {
  servicePrice?: number;
  practitionerId?: string;
  scheduledAt?: Date;
  status?: string;
  paymentStatus?: string;
};

function insertBooking(id: string, overrides: BookingOverrides = {}) {
  return query(
    `insert into public.bookings
       (id, reference, service_id, service_title, service_price, service_duration, practitioner_id,
        practitioner_name, client_name, client_email, client_phone, birth_date, birth_time, birth_place,
        scheduled_at, status, payment_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      id,
      `ref-${id}`,
      SERVICE,
      "Portal Consultation",
      overrides.servicePrice ?? 1000,
      45,
      overrides.practitionerId ?? P,
      "Portal Practitioner",
      "Portal Client",
      `client-${id}@example.test`,
      null,
      "1990-04-12",
      "06:30",
      "Delhi, India",
      overrides.scheduledAt ?? new Date(Date.now() + DAY),
      overrides.status ?? "confirmed",
      overrides.paymentStatus ?? "paid",
    ],
  );
}

async function seed() {
  await cleanup();
  await query(`insert into public.members (id, name, email, birth_date, birth_time, birth_place) values ($1,$2,$3,$4,$5,$6)`, [
    MEMBER,
    "Portal Member",
    "portal-itest-member@example.test",
    "1992-08-21",
    "14:15",
    "Pune, India",
  ]);
  await query(`insert into public.services (id, title, slug) values ($1,$2,$3)`, [SERVICE, "Portal Consultation", "portal-consultation"]);
  for (const id of PRACTITIONER_IDS) {
    await query(
      `insert into public.practitioners (id, name, slug, email, active, is_demo_account, chat_rate_per_minute, bio)
       values ($1,$2,$3,$4,true,$5,120,$6)`,
      [id, `Portal ${id}`, `portal-${id}`, `${id}@example.test`, id === DEMO, `original bio for ${id}`],
    );
  }
}

async function warmPool() {
  // getPgPool() opens connections lazily, so unfired concurrency tests stagger
  // while connecting and never actually overlap. Warm every slot first.
  await Promise.all(Array.from({ length: 10 }, () => query("select 1")));
}

beforeEach(async () => {
  if (!cutoverActive) return;
  vi.clearAllMocks();
  engine.buildKundliChart.mockReturnValue({ houses: [] });
  engine.renderKundliReport.mockReturnValue("RENDERED KUNDLI");
  engine.buildVarshphalChart.mockReturnValue({ solarReturn: {} });
  engine.renderVarshphalReport.mockReturnValue("RENDERED VARSHPHAL");
  await seed();
});

afterAll(async () => {
  if (!cutoverActive) return;
  await cleanup();
  await closePgPool();
});

describeCutover("getPortalStatsInSupabase", () => {
  it("counts only paid non-cancelled bookings and only ended chat sessions", async () => {
    // ₹1000 + ₹500 count; the paid-but-cancelled ₹9999 and the unpaid ₹7777 must not.
    await insertBooking("portal-itest-b1", { servicePrice: 1000, status: "confirmed" });
    await insertBooking("portal-itest-b2", { servicePrice: 500, status: "completed" });
    await insertBooking("portal-itest-b3", { servicePrice: 9999, status: "cancelled", paymentStatus: "paid" });
    await insertBooking("portal-itest-b4", { servicePrice: 7777, status: "confirmed", paymentStatus: "unpaid" });
    await query(`insert into public.chat_sessions (id, member_id, practitioner_id, status, captured_amount) values ($1,$2,$3,'ended',250)`, ["portal-itest-cs1", MEMBER, P]);
    await query(`insert into public.chat_sessions (id, member_id, practitioner_id, status, captured_amount) values ($1,$2,$3,'active',8888)`, ["portal-itest-cs2", MEMBER, P]);

    const stats = await getPortalStatsInSupabase(P);
    expect(stats.totalEarned).toBe(1750);
    expect(stats.completedCount).toBe(1);
  });

  it("counts upcoming only for pending or confirmed bookings in the future", async () => {
    await insertBooking("portal-itest-u1", { status: "pending", scheduledAt: new Date(Date.now() + 2 * DAY) });
    await insertBooking("portal-itest-u2", { status: "confirmed", scheduledAt: new Date(Date.now() + 3 * DAY) });
    await insertBooking("portal-itest-u3", { status: "pending", scheduledAt: new Date(Date.now() - 2 * DAY) });
    await insertBooking("portal-itest-u4", { status: "completed", scheduledAt: new Date(Date.now() + 4 * DAY) });

    expect((await getPortalStatsInSupabase(P)).upcomingCount).toBe(2);
  });

  it("averages published reviews only, rounded the way the Firestore path rounded", async () => {
    const review = (id: string, rating: number, status: string) =>
      query(
        `insert into public.practitioner_reviews (id, practitioner_id, reviewer_name, rating, clarity, empathy, usefulness, body, status)
         values ($1,$2,$3,$4,4,4,4,'body',$5)`,
        [id, P, "Reviewer", rating, status],
      );
    await review("portal-itest-r1", 4, "published");
    await review("portal-itest-r2", 4, "published");
    await review("portal-itest-r3", 5, "published");
    await review("portal-itest-r4", 1, "hidden");

    const stats = await getPortalStatsInSupabase(P);
    expect(stats.reviewCount).toBe(3);
    expect(stats.avgRating).toBe(Math.round((13 / 3) * 10) / 10);
  });

  it("subtracts paid and pending payouts from the available balance", async () => {
    await insertBooking("portal-itest-p1", { servicePrice: 1000, status: "completed" });
    await insertBooking("portal-itest-p2", { servicePrice: 1000, status: "completed" });
    const payout = (id: string, amount: number, status: string) =>
      query(`insert into public.practitioner_payouts (id, practitioner_id, amount, currency, status, payout_method) values ($1,$2,$3,'INR',$4,'bank_transfer')`, [
        id,
        P,
        amount,
        status,
      ]);
    await payout("portal-itest-po1", 300, "paid");
    await payout("portal-itest-po2", 200, "requested");
    await payout("portal-itest-po3", 100, "approved");
    // Rejected requests are neither paid out nor pending, so they must not reduce
    // what the practitioner can still ask for.
    await payout("portal-itest-po4", 5000, "rejected");

    const stats = await getPortalStatsInSupabase(P);
    expect(stats.totalEarned).toBe(2000);
    expect(stats.paidOut).toBe(300);
    expect(stats.pendingOut).toBe(300);
    expect(stats.availableBalance).toBe(1400);
  });

  it("returns real numbers, not the strings node-postgres gives for numeric and bigint", async () => {
    await insertBooking("portal-itest-t1", { servicePrice: 1000 });
    const stats = await getPortalStatsInSupabase(P);
    for (const key of ["totalEarned", "completedCount", "upcomingCount", "paidOut", "pendingOut", "availableBalance", "avgRating", "reviewCount"] as const) {
      expect(typeof stats[key], key).toBe("number");
    }
  });

  it("never reports a negative available balance", async () => {
    await insertBooking("portal-itest-n1", { servicePrice: 100 });
    await query(`insert into public.practitioner_payouts (id, practitioner_id, amount, currency, status, payout_method) values ($1,$2,5000,'INR','paid','bank_transfer')`, ["portal-itest-neg", P]);
    expect((await getPortalStatsInSupabase(P)).availableBalance).toBe(0);
  });
});

describeCutover("getPortalBookingsInSupabase", () => {
  it("returns only this practitioner's bookings, newest first", async () => {
    await insertBooking("portal-itest-o1", { scheduledAt: new Date(Date.now() + DAY) });
    await insertBooking("portal-itest-o2", { scheduledAt: new Date(Date.now() + 5 * DAY) });
    await insertBooking("portal-itest-o3", { scheduledAt: new Date(Date.now() + 3 * DAY) });
    await insertBooking("portal-itest-ox", { practitionerId: OTHER });

    const rows = await getPortalBookingsInSupabase(P);
    expect(rows.map((r) => r.id)).toEqual(["portal-itest-o2", "portal-itest-o3", "portal-itest-o1"]);
    expect(typeof rows[0].servicePrice).toBe("number");
    expect(rows[0].clientEmail).toBe("client-portal-itest-o2@example.test");
    expect(rows[0].scheduledAt).toBeInstanceOf(Date);
  });
});

describeCutover("portal schedule", () => {
  const seedSchedule = async () => {
    await query(
      `insert into public.availability_rules (id, practitioner_id, weekday, start_time, end_time, active) values
        ($1,$2,3,'14:00','18:00',true),($3,$2,1,'09:00','12:00',true),($4,$2,1,'18:00','20:00',false)`,
      ["portal-itest-ar1", P, "portal-itest-ar2", "portal-itest-ar3"],
    );
    await query(
      `insert into public.practitioner_time_off (id, practitioner_id, reason, starts_at, ends_at) values
        ($1,$2,'trip', $3, $4),
        ($5,$2,null,  $6, $7),
        ($8,$2,'old',  $9, $10),
        ($11,$2,'legacy', null, $12)`,
      [
        "portal-itest-to1", P, new Date(Date.now() + 5 * DAY), new Date(Date.now() + 6 * DAY),
        "portal-itest-to2", new Date(Date.now() + 1 * DAY), new Date(Date.now() + 2 * DAY),
        "portal-itest-to3", new Date(Date.now() - 10 * DAY), new Date(Date.now() - 9 * DAY),
        "portal-itest-to4", new Date(Date.now() + 10 * DAY),
      ],
    );
  };

  it("orders rules by weekday and drops time off that has already ended", async () => {
    await seedSchedule();
    const { rules, timeOff } = await getPortalScheduleInSupabase(P);
    expect(rules.map((r) => r.weekday)).toEqual([1, 1, 3]);
    expect(typeof rules[0].weekday).toBe("number");
    // Ends in the past is gone. The null starts_at row falls back to "now", which
    // is what the Firestore toDate() fallback produced, so it sorts first.
    expect(timeOff.map((t) => t.id)).toEqual(["portal-itest-to4", "portal-itest-to2", "portal-itest-to1"]);
  });

  it("replaces the whole schedule rather than adding to it", async () => {
    await seedSchedule();
    await replacePortalScheduleInSupabase(
      P,
      [{ weekday: 5, startTime: "10:00", endTime: "11:00", active: true }],
      [{ startsAt: new Date(Date.now() + 20 * DAY), endsAt: new Date(Date.now() + 21 * DAY), reason: "new" }],
    );
    const { rules, timeOff } = await getPortalScheduleInSupabase(P);
    expect(rules.map((r) => r.weekday)).toEqual([5]);
    expect(timeOff.map((t) => t.reason)).toEqual(["new"]);
  });

  it("saves an empty schedule as an empty schedule", async () => {
    await seedSchedule();
    await replacePortalScheduleInSupabase(P, [], []);
    const { rules, timeOff } = await getPortalScheduleInSupabase(P);
    expect(rules).toEqual([]);
    expect(timeOff).toEqual([]);
  });

  it("leaves one winner when two saves race over an empty schedule", async () => {
    await warmPool();
    // Without the per-practitioner advisory lock both transactions delete zero
    // rows and then both insert, and the practitioner ends up with the union of
    // two schedules instead of the second save replacing the first.
    await Promise.all([
      replacePortalScheduleInSupabase(P, [{ weekday: 1, startTime: "09:00", endTime: "10:00", active: true }], []),
      replacePortalScheduleInSupabase(P, [{ weekday: 2, startTime: "11:00", endTime: "12:00", active: true }], []),
    ]);
    const { rules } = await getPortalScheduleInSupabase(P);
    expect(rules).toHaveLength(1);
  });

  it("serialises a burst of concurrent saves down to one schedule", async () => {
    await warmPool();
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        replacePortalScheduleInSupabase(
          P,
          [
            { weekday: index % 7, startTime: "09:00", endTime: "10:00", active: true },
            { weekday: index % 7, startTime: "12:00", endTime: "13:00", active: true },
          ],
          [{ startsAt: new Date(Date.now() + index * DAY), endsAt: new Date(Date.now() + index * DAY + DAY), reason: `run ${index}` }],
        ),
      ),
    );
    const { rules, timeOff } = await getPortalScheduleInSupabase(P);
    expect(rules).toHaveLength(2);
    expect(timeOff).toHaveLength(1);
  });
});

describeCutover("portal profile", () => {
  it("updates only the columns present in the patch and returns the whole row", async () => {
    // The twin stores verbatim: the trimming, length caps and "blank means default"
    // rules live in practitioner-portal.ts so both providers share them.
    const updated = await updatePortalProfileInSupabase(P, { bio: "a new bio", photoUrl: null });
    expect(updated?.bio).toBe("a new bio");
    expect(updated?.photoUrl).toBeNull();
    // Untouched by this patch:
    expect(updated?.languages).toBe("");
    expect(updated?.specialties).toBe("");
    expect(updated?.name).toBe(`Portal ${P}`);
    expect(updated?.updatedAt).toBeInstanceOf(Date);
    expect(typeof updated?.chatRatePerMinute).toBe("number");

    const persisted = (await query(`select bio, languages, specialties from public.practitioners where id = $1`, [P])).rows[0];
    expect(persisted.bio).toBe("a new bio");
    expect(persisted.specialties).toBe("");
  });

  it("returns null for a practitioner that does not exist", async () => {
    expect(await updatePortalProfileInSupabase("portal-itest-ghost", { bio: "x" })).toBeNull();
  });

  it("flips online and stamps updated_at", async () => {
    const before = (await query(`select updated_at from public.practitioners where id = $1`, [P])).rows[0].updated_at as Date;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await setPortalOnlineInSupabase(P, true);
    const after = (await query(`select online, updated_at from public.practitioners where id = $1`, [P])).rows[0];
    expect(after.online).toBe(true);
    expect((after.updated_at as Date).getTime()).toBeGreaterThan(before.getTime());
  });
});

describeCutover("payout admin reads", () => {
  it("returns lites for exactly the requested ids, with encrypted values untouched", async () => {
    await query(`update public.practitioners set bank_account_number_enc = $2, bank_ifsc = $3, upi_id_enc = $4 where id = $1`, [
      P,
      "enc:account",
      "HDFC0001234",
      "enc:upi",
    ]);
    const map = await getPortalPractitionerLitesInSupabase([P, "portal-itest-ghost"]);
    expect(map.size).toBe(1);
    const lite = map.get(P);
    expect(lite?.bankAccountNumberEnc).toBe("enc:account");
    expect(lite?.upiIdEnc).toBe("enc:upi");
    expect(lite?.bankIfsc).toBe("HDFC0001234");
    expect(lite?.email).toBe(`${P}@example.test`);
  });

  it("returns an empty map for no ids instead of scanning the table", async () => {
    expect((await getPortalPractitionerLitesInSupabase([])).size).toBe(0);
  });

  it("excludes demo accounts from the duplicate-payout-details scan", async () => {
    const sources = await getPayoutFieldSourcesInSupabase();
    const ids = sources.map((s) => s.id);
    expect(ids).toContain(P);
    expect(ids).toContain(OTHER);
    expect(ids).not.toContain(DEMO);
  });

  it("leaves columns alone when the input is null, but always stamps the cooldown clock", async () => {
    await query(`update public.practitioners set bank_account_name = $2, bank_account_number_enc = $3, bank_ifsc = $4, upi_id_enc = $5 where id = $1`, [
      P,
      "Existing Name",
      "enc:existing",
      "ICIC0000001",
      "enc:existing-upi",
    ]);

    await updatePortalPayoutDetailsInSupabase(P, {
      bankAccountName: null,
      bankAccountNumberEnc: null,
      bankIfsc: null,
      upiIdEnc: "enc:replacement",
    });

    const row = (await query(`select bank_account_name, bank_account_number_enc, bank_ifsc, upi_id_enc, payout_details_updated_at from public.practitioners where id = $1`, [P])).rows[0];
    expect(row.bank_account_name).toBe("Existing Name");
    expect(row.bank_account_number_enc).toBe("enc:existing");
    expect(row.bank_ifsc).toBe("ICIC0000001");
    expect(row.upi_id_enc).toBe("enc:replacement");
    expect(row.payout_details_updated_at).not.toBeNull();
  });

  it("still starts the auto-approval cooldown when nothing actually changed", async () => {
    // A blank form submission writes no columns, but it did touch the payout
    // settings, and that is the event the 72-hour cooldown protects against.
    await updatePortalPayoutDetailsInSupabase(P, { bankAccountName: null, bankAccountNumberEnc: null, bankIfsc: null, upiIdEnc: null });
    const row = (await query(`select payout_details_updated_at from public.practitioners where id = $1`, [P])).rows[0];
    expect(row.payout_details_updated_at).not.toBeNull();
  });
});

describeCutover("report cache columns added by migration 0006", () => {
  it("caches a Kundli and a Varshphal on a booking and returns the updated row", async () => {
    await insertBooking("portal-itest-k1");

    const kundli = await cacheBookingKundliInSupabase("portal-itest-k1", "cached kundli text");
    expect(kundli?.kundliSummary).toBe("cached kundli text");
    expect(kundli?.kundliGeneratedAt).toBeInstanceOf(Date);

    const varshphal = await cacheBookingVarshphalInSupabase("portal-itest-k1", "cached varshphal text", THIS_YEAR);
    expect(varshphal?.varshphalSummary).toBe("cached varshphal text");
    expect(varshphal?.varshphalYear).toBe(THIS_YEAR);
    expect(typeof varshphal?.varshphalYear).toBe("number");
  });

  it("caches both reports on a chat session, which has no such columns without 0006", async () => {
    await query(`insert into public.chat_sessions (id, member_id, practitioner_id, status) values ($1,$2,$3,'ended')`, ["portal-itest-cc1", MEMBER, P]);

    await cacheChatKundliInSupabase("portal-itest-cc1", "chat kundli text");
    await cacheChatVarshphalInSupabase("portal-itest-cc1", "chat varshphal text", THIS_YEAR);

    const session = await getPortalChatSessionInSupabase("portal-itest-cc1");
    expect(session?.kundliSummary).toBe("chat kundli text");
    expect(session?.varshphalSummary).toBe("chat varshphal text");
    expect(session?.varshphalYear).toBe(THIS_YEAR);
    expect(session?.memberId).toBe(MEMBER);
  });

  it("reads a member's birth profile for chat-session reports", async () => {
    const profile = await getPortalMemberBirthProfileInSupabase(MEMBER);
    expect(profile).toEqual({ name: "Portal Member", birthDate: "1992-08-21", birthTime: "14:15", birthPlace: "Pune, India" });
    expect(await getPortalMemberBirthProfileInSupabase("portal-itest-ghost")).toBeNull();
  });
});

describeCutover("gated portal actions", () => {
  it("reads a booking through the gate", async () => {
    await insertBooking("portal-itest-g1");
    const row = await getPortalBookingInSupabase("portal-itest-g1");
    expect(row?.id).toBe("portal-itest-g1");
    expect(await getPortalBookingInSupabase("portal-itest-ghost")).toBeNull();
  });

  it("reports a missing booking and someone else's booking identically", async () => {
    await insertBooking("portal-itest-g2", { practitionerId: OTHER });
    await expect(getBookingKundliSummary("portal-itest-g2", P)).rejects.toThrow(KundliSummaryError);
    await expect(getBookingKundliSummary("portal-itest-g2", P)).rejects.toThrow("Booking not found.");
    await expect(getBookingKundliSummary("portal-itest-ghost", P)).rejects.toThrow("Booking not found.");
    expect(engine.buildKundliChart).not.toHaveBeenCalled();
  });

  it("generates a Kundli once and serves the cached copy afterwards", async () => {
    await insertBooking("portal-itest-g3");

    const first = await getBookingKundliSummary("portal-itest-g3", P);
    expect(first.kundliSummary).toBe("RENDERED KUNDLI");
    expect(engine.buildKundliChart).toHaveBeenCalledTimes(1);

    const second = await getBookingKundliSummary("portal-itest-g3", P);
    expect(second.kundliSummary).toBe("RENDERED KUNDLI");
    expect(engine.buildKundliChart).toHaveBeenCalledTimes(1);
  });

  it("regenerates a Varshphal whose cached year is not the current one", async () => {
    await insertBooking("portal-itest-g4");
    await cacheBookingVarshphalInSupabase("portal-itest-g4", "stale last-year report", THIS_YEAR - 1);

    const fresh = await getBookingVarshphalSummary("portal-itest-g4", P);
    expect(fresh.varshphalSummary).toBe("RENDERED VARSHPHAL");
    expect(fresh.varshphalYear).toBe(THIS_YEAR);
    expect(engine.buildVarshphalChart).toHaveBeenCalledTimes(1);

    // And now that it is current, it is reused.
    await getBookingVarshphalSummary("portal-itest-g4", P);
    expect(engine.buildVarshphalChart).toHaveBeenCalledTimes(1);
  });

  it("refuses a chat-session report when the client has no birth profile", async () => {
    await query(`insert into public.members (id, name, email) values ($1,$2,$3)`, ["portal-itest-bare", "Bare Member", "portal-itest-bare@example.test"]);
    await query(`insert into public.chat_sessions (id, member_id, practitioner_id, status) values ($1,$2,$3,'active')`, ["portal-itest-g5", "portal-itest-bare", P]);
    try {
      await expect(getChatMemberKundliSummary("portal-itest-g5", P)).rejects.toThrow(
        "This client hasn't completed their birth profile yet, so a Kundli can't be generated.",
      );
    } finally {
      await query(`delete from public.chat_sessions where id = $1`, ["portal-itest-g5"]);
      await query(`delete from public.members where id = $1`, ["portal-itest-bare"]);
    }
  });

  it("caches a chat-session Kundli on the session row", async () => {
    await query(`insert into public.chat_sessions (id, member_id, practitioner_id, status) values ($1,$2,$3,'active')`, ["portal-itest-g6", MEMBER, P]);
    const first = await getChatMemberKundliSummary("portal-itest-g6", P);
    expect(first.kundliSummary).toBe("RENDERED KUNDLI");
    expect(engine.buildKundliChart).toHaveBeenCalledTimes(1);

    const second = await getChatMemberKundliSummary("portal-itest-g6", P);
    expect(second.kundliSummary).toBe("RENDERED KUNDLI");
    expect(engine.buildKundliChart).toHaveBeenCalledTimes(1);
  });

  it("validates a schedule before writing it, so a bad save writes nothing", async () => {
    await replacePortalScheduleInSupabase(P, [{ weekday: 1, startTime: "09:00", endTime: "10:00", active: true }], []);

    await expect(
      updatePractitionerSchedule(P, {
        rules: [
          { weekday: 1, startTime: "09:00", endTime: "12:00" },
          { weekday: 1, startTime: "11:00", endTime: "13:00" },
        ],
        timeOff: [],
      }),
    ).rejects.toThrow(ScheduleError);

    // The rejected save must not have wiped the schedule it never got to replace.
    const { rules } = await getPortalScheduleInSupabase(P);
    expect(rules).toHaveLength(1);
    expect(rules[0].weekday).toBe(1);
  });

  it("round-trips a valid schedule through the gated action", async () => {
    await updatePractitionerSchedule(P, {
      rules: [
        { weekday: 2, startTime: "10:00", endTime: "12:00" },
        { weekday: 4, startTime: "16:00", endTime: "18:00", active: false },
      ],
      timeOff: [{ startsAt: new Date(Date.now() + 9 * DAY).toISOString(), endsAt: new Date(Date.now() + 10 * DAY).toISOString(), reason: "away" }],
    });
    const { rules, timeOff } = await getPortalScheduleInSupabase(P);
    expect(rules.map((r) => [r.weekday, r.active])).toEqual([
      [2, true],
      [4, false],
    ]);
    expect(timeOff).toHaveLength(1);
    expect(timeOff[0].reason).toBe("away");
  });
});
