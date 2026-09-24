import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// unstable_cache needs Next's incremental cache, which does not exist outside a Next
// runtime. The wallet path reads settings.currency off this, so it must be complete.
vi.mock("@/lib/studio-settings", () => ({
  getStudioSettings: async () => ({
    studioName: "Adi Jyotish Guru",
    supportEmail: "support@adijyotishguru.com",
    timezone: "Asia/Kolkata",
    currency: "INR",
    cancellationHours: 24,
    bookingLeadMinutes: 15,
    replySlaHours: 24,
    gstRate: 18,
    gstin: null,
    updatedAt: new Date().toISOString(),
  }),
}));

const spies = vi.hoisted(() => ({ createNotification: vi.fn(async (_input: unknown) => undefined) }));
vi.mock("@/lib/notifications", () => ({ createNotification: spies.createNotification }));

import { query } from "@/lib/postgres";
import { allocateReferralCodeInSupabase, insertReferralInSupabase } from "@/lib/referrals-supabase";
import {
  MIN_RECHARGE_FOR_REWARD,
  REFERRAL_REFEREE_REWARD,
  REFERRAL_REFERRER_REWARD,
  ensureReferralCode,
  getReferralStats,
  processReferralReward,
  recordReferral,
} from "@/lib/referrals";

/**
 * Integration test for the referral port. Skipped unless SUPABASE_DB_URL points at
 * a reachable database.
 *
 * The interesting cases are the two races: two calls allocating a code for the same
 * member, and two referees of one referrer settling together at the reward cap.
 * The second is the hole the advisory lock exists to close.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const M = "ref-itest-";
const MAX_REWARDED = 50;

async function seedMember(id: string, referralCode: string | null = null) {
  await query(
    `insert into public.members (id, name, email, referral_code) values ($1,$2,$3,$4)
     on conflict (id) do update set referral_code = excluded.referral_code`,
    [id, id, `${id}@example.test`, referralCode],
  );
}

// referrals.referee_id and .referrer_id are both foreign keys to members, so the
// filler rows these tests use to reach the cap need member parents too.
async function seedMembers(ids: string[]) {
  for (const id of ids) await seedMember(id);
}

async function seedReferral(refereeId: string, referrerId: string, status: string) {
  await query(
    `insert into public.referrals (id, referee_id, referrer_id, code, status)
     values ($1,$1,$2,$3,$4) on conflict (id) do update set status = excluded.status`,
    [refereeId, referrerId, "REFTEST", status],
  );
}

const balanceOf = async (memberId: string) => {
  const { rows } = await query<{ balance: string }>(`select balance from public.wallets where id = $1`, [memberId]);
  return rows[0] ? Number(rows[0].balance) : null;
};

async function cleanup() {
  await query(`delete from public.wallet_entries where wallet_id like $1`, [`${M}%`]);
  await query(`delete from public.wallets where id like $1`, [`${M}%`]);
  await query(`delete from public.referrals where referee_id like $1 or referrer_id like $1`, [`${M}%`]);
  await query(`delete from public.members where id like $1`, [`${M}%`]);
}

describeDb("referrals (live database)", () => {
  beforeEach(async () => {
    await cleanup();
    spies.createNotification.mockClear();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("allocates a code once and returns the same one after", async () => {
    await seedMember(`${M}a`);
    const first = await ensureReferralCode(`${M}a`);
    expect(first).toMatch(/^[A-Z2-9]{7}$/);
    expect(await ensureReferralCode(`${M}a`)).toBe(first);
  });

  it("gives concurrent callers for one member the same code", async () => {
    // Both calls race past the "already has one" read; the `referral_code is null`
    // predicate means only one write lands and the loser reports the winner's code.
    await seedMember(`${M}race`);
    const codes = await Promise.all([
      ensureReferralCode(`${M}race`),
      ensureReferralCode(`${M}race`),
      ensureReferralCode(`${M}race`),
    ]);
    expect(new Set(codes).size).toBe(1);
    const { rows } = await query<{ n: number }>(`select count(*)::int n from public.members where referral_code = $1`, [codes[0]]);
    expect(rows[0]?.n).toBe(1);
  });

  it("records a pending referral and ignores a second one for the same referee", async () => {
    await seedMember(`${M}referrer`, "REFTEST");
    await seedMember(`${M}referee`);

    await recordReferral({ refereeId: `${M}referee`, code: "reftest" });
    await recordReferral({ refereeId: `${M}referee`, code: "reftest" });

    const { rows } = await query<{ n: number; status: string }>(
      `select count(*)::int n, min(status) status from public.referrals where id = $1`,
      [`${M}referee`],
    );
    expect(rows[0]?.n).toBe(1);
    expect(rows[0]?.status).toBe("pending");
  });

  it("ignores a self-referral", async () => {
    await seedMember(`${M}self`, "REFTEST");
    await recordReferral({ refereeId: `${M}self`, code: "REFTEST" });
    const { rows } = await query<{ n: number }>(`select count(*)::int n from public.referrals where id = $1`, [`${M}self`]);
    expect(rows[0]?.n).toBe(0);
  });

  it("does not resurrect an already-settled referral back to pending", async () => {
    // recordReferral is called at signup and its duplicate path is a no-op. With an
    // upsert instead of on-conflict-do-nothing, a late duplicate would silently
    // reset a paid-out referral to pending and make it payable a second time.
    await seedMember(`${M}refd`);
    await seedMember(`${M}refd_referee`);
    await seedReferral(`${M}refd_referee`, `${M}refd`, "rewarded");

    const inserted = await insertReferralInSupabase({ refereeId: `${M}refd_referee`, referrerId: `${M}refd`, code: "REFTEST" });
    expect(inserted).toBe(false);

    const { rows } = await query<{ status: string }>(`select status from public.referrals where id = $1`, [`${M}refd_referee`]);
    expect(rows[0]?.status).toBe("rewarded");
  });

  it("reports a code clash instead of overwriting another member's code", async () => {
    // The unique index is what decides this, not a pre-check, so it is reachable
    // deterministically by asking for a code somebody already holds.
    await seedMember(`${M}holder`, "TAKEN99");
    await seedMember(`${M}late`);

    const outcome = await allocateReferralCodeInSupabase(`${M}late`, "TAKEN99");
    expect(outcome.kind).toBe("code_taken");

    const { rows } = await query<{ code: string | null }>(`select referral_code as code from public.members where id = $1`, [`${M}late`]);
    expect(rows[0]?.code).toBeNull();
  });

  it("leaves an existing code alone and reports it", async () => {
    // `referral_code is null` in the update is what stops a second allocation for
    // the same member from clobbering the first one's code.
    await seedMember(`${M}settled`, "FIRST01");
    const outcome = await allocateReferralCodeInSupabase(`${M}settled`, "SECOND2");
    expect(outcome).toEqual({ kind: "already_set", code: "FIRST01" });

    const { rows } = await query<{ code: string }>(`select referral_code as code from public.members where id = $1`, [`${M}settled`]);
    expect(rows[0]?.code).toBe("FIRST01");
  });

  it("pays nobody for a recharge under the minimum", async () => {
    await seedMember(`${M}ref1`);
    await seedMember(`${M}referee1`);
    await seedReferral(`${M}referee1`, `${M}ref1`, "pending");

    await processReferralReward(`${M}referee1`, MIN_RECHARGE_FOR_REWARD - 1);

    expect(await balanceOf(`${M}referee1`)).toBeNull();
    const { rows } = await query<{ status: string }>(`select status from public.referrals where id = $1`, [`${M}referee1`]);
    expect(rows[0]?.status).toBe("pending");
  });

  it("credits both sides, flips the status, and does not pay twice", async () => {
    await seedMember(`${M}ref2`);
    await seedMember(`${M}referee2`);
    await seedReferral(`${M}referee2`, `${M}ref2`, "pending");

    await processReferralReward(`${M}referee2`, MIN_RECHARGE_FOR_REWARD);

    expect(await balanceOf(`${M}referee2`)).toBe(REFERRAL_REFEREE_REWARD);
    expect(await balanceOf(`${M}ref2`)).toBe(REFERRAL_REFERRER_REWARD);
    const { rows } = await query<{ status: string }>(`select status from public.referrals where id = $1`, [`${M}referee2`]);
    expect(rows[0]?.status).toBe("rewarded");

    // The wallet ledger entries are the idempotency key, and the status flip means
    // the second call never reaches the credit at all.
    await processReferralReward(`${M}referee2`, MIN_RECHARGE_FOR_REWARD);
    expect(await balanceOf(`${M}referee2`)).toBe(REFERRAL_REFEREE_REWARD);
    expect(await balanceOf(`${M}ref2`)).toBe(REFERRAL_REFERRER_REWARD);
  });

  it("never credits a referee who has no pending referral", async () => {
    await seedMember(`${M}nobody`);
    await processReferralReward(`${M}nobody`, MIN_RECHARGE_FOR_REWARD * 10);
    expect(await balanceOf(`${M}nobody`)).toBeNull();
  });

  it("caps a referrer at the limit and marks the excess capped", async () => {
    await seedMember(`${M}ref3`);
    await seedMembers(Array.from({ length: MAX_REWARDED }, (_, i) => `${M}done${i}`));
    for (let i = 0; i < MAX_REWARDED; i += 1) await seedReferral(`${M}done${i}`, `${M}ref3`, "rewarded");
    await seedMember(`${M}referee3`);
    await seedReferral(`${M}referee3`, `${M}ref3`, "pending");

    await processReferralReward(`${M}referee3`, MIN_RECHARGE_FOR_REWARD);

    // The referee is still paid — the cap only bounds the referrer's side.
    expect(await balanceOf(`${M}referee3`)).toBe(REFERRAL_REFEREE_REWARD);
    expect(await balanceOf(`${M}ref3`)).toBeNull();
    const { rows } = await query<{ status: string }>(`select status from public.referrals where id = $1`, [`${M}referee3`]);
    expect(rows[0]?.status).toBe("capped");
  });

  it("lets exactly one of two concurrent settlements through the cap", async () => {
    // This is the race the advisory lock exists for: both calls count the referrer's
    // rewarded total, and without serialisation both would read the same
    // pre-increment number, both decide they are under the cap, and both credit.
    await seedMember(`${M}ref4`);
    await seedMembers(Array.from({ length: MAX_REWARDED - 1 }, (_, i) => `${M}cap${i}`));
    for (let i = 0; i < MAX_REWARDED - 1; i += 1) await seedReferral(`${M}cap${i}`, `${M}ref4`, "rewarded");
    await seedMember(`${M}twin1`);
    await seedMember(`${M}twin2`);
    await seedReferral(`${M}twin1`, `${M}ref4`, "pending");
    await seedReferral(`${M}twin2`, `${M}ref4`, "pending");

    // The pool opens connections lazily, which staggers the calls enough to hide a
    // missing lock, so warm it before the race.
    await Promise.all(Array.from({ length: 10 }, () => query(`select 1`)));

    await Promise.all([
      processReferralReward(`${M}twin1`, MIN_RECHARGE_FOR_REWARD),
      processReferralReward(`${M}twin2`, MIN_RECHARGE_FOR_REWARD),
    ]);

    const { rows } = await query<{ status: string }>(
      `select status from public.referrals where id = any($1::text[]) order by id`,
      [[`${M}twin1`, `${M}twin2`]],
    );
    const rewarded = rows.filter((r) => r.status === "rewarded").length;
    const capped = rows.filter((r) => r.status === "capped").length;
    expect([rewarded, capped]).toEqual([1, 1]);
    expect(await balanceOf(`${M}ref4`)).toBe(REFERRAL_REFERRER_REWARD);
  });

  it("notifies the referrer on a milestone total", async () => {
    await seedMember(`${M}ref5`);
    await seedMembers(Array.from({ length: 4 }, (_, i) => `${M}ms${i}`));
    for (let i = 0; i < 4; i += 1) await seedReferral(`${M}ms${i}`, `${M}ref5`, "rewarded");
    await seedMember(`${M}referee5`);
    await seedReferral(`${M}referee5`, `${M}ref5`, "pending");

    await processReferralReward(`${M}referee5`, MIN_RECHARGE_FOR_REWARD);

    // The fifth rewarded referral is a milestone, so this is the crossing call.
    expect(spies.createNotification).toHaveBeenCalledTimes(1);
    expect(spies.createNotification.mock.calls[0]?.[0]).toMatchObject({
      recipientType: "member",
      recipientId: `${M}ref5`,
      type: "referral_milestone",
    });
  });

  it("reports stats from the referrer's own referrals only", async () => {
    await seedMember(`${M}ref6`);
    await seedMember(`${M}other6`);
    await seedMembers([`${M}x1`, `${M}x2`, `${M}x3`]);
    await seedReferral(`${M}x1`, `${M}ref6`, "rewarded");
    await seedReferral(`${M}x2`, `${M}ref6`, "pending");
    await seedReferral(`${M}x3`, `${M}other6`, "rewarded");

    const stats = await getReferralStats(`${M}ref6`);
    expect(stats).toMatchObject({ invited: 2, rewarded: 1, totalEarned: REFERRAL_REFERRER_REWARD });
    expect(stats.code).toBeTruthy();
  });
});
