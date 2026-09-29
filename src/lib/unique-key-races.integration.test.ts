import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * Concurrent first writes to tables with two unique keys.
 *
 * Each table here has a primary key derived one-to-one from a second unique key (a wallet's id is
 * its member id; an experiment variant's id is `${key}/${variant}`). An `on conflict (id)` clause
 * absorbs a conflict only on the index it names, so when two first writes of the same row race,
 * the loser can collide on the *other* index and raise 23505: a lost count, or a 500 where the
 * member should have got a wallet or a friendly "checkout already in progress". CI caught this on
 * the experiment counter (29 of 30 impressions recorded).
 *
 * The collision window is narrow, so each case runs many rounds of concurrent first writes; with
 * the old statements every case here failed within its rounds. Needs a migrated database.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));

const { getOrCreateWalletInSupabase } = await import("@/lib/wallet-supabase");
const { incrementExperimentCounterInSupabase } = await import("@/lib/experiments-supabase");
const { saveJournalEntryInSupabase } = await import("@/lib/engagement-supabase");
const { claimSubscriptionCheckoutInSupabase } = await import("@/lib/subscriptions-supabase");
const { toggleFavoriteInSupabase } = await import("@/lib/member-favorites-supabase");
const { upsertSystemRoleInSupabase } = await import("@/lib/admin-roles-supabase");

const P = "race_itest_";
const ROUNDS = 150;
const members = Array.from({ length: ROUNDS }, (_, i) => `${P}m${i}`);
const EXPERIMENT = "dashboard-onboarding-cta";

async function cleanup() {
  await query(`delete from public.experiment_variants where variant like 'race\\_itest\\_%'`);
  await query(`delete from public.admin_roles where id like 'race\\_itest\\_%'`);
  await query(`delete from public.member_favorites where member_id like 'race\\_itest\\_%'`);
  await query(`delete from public.practitioners where id = '${P}prac'`);
  await query(`delete from public.members where id like 'race\\_itest\\_%'`);
  await query(`delete from public.membership_plans where id = '${P}plan'`);
}

/** Runs `write` `times` times at once, `ROUNDS` times over, on a fresh row each round. */
async function race<T>(times: number, write: (round: number) => Promise<T>): Promise<T[][]> {
  const rounds: T[][] = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    rounds.push(await Promise.all(Array.from({ length: times }, () => write(round))));
  }
  return rounds;
}

describeDb("concurrent first writes to rows with two unique keys", () => {
  beforeAll(async () => {
    await cleanup();
    await query(`insert into public.experiments (id) values ($1) on conflict do nothing`, [EXPERIMENT]);
    await query(`insert into public.membership_plans (id, key, name) values ('${P}plan', '${P}plan', 'Race plan')`);
    await query(`insert into public.practitioners (id, name, slug, email, active) values ('${P}prac', 'P', '${P}prac', '${P}prac@example.test', true)`);
    for (const id of members) await query(`insert into public.members (id, name, email) values ($1, 'M', $2)`, [id, `${id}@example.test`]);
  });
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("gives every member exactly one wallet, however many requests arrive first", async () => {
    await race(8, (round) => getOrCreateWalletInSupabase(members[round], "INR"));
    const { rows } = await query<{ n: number }>(`select count(*)::int as n from public.wallets where member_id like 'race\\_itest\\_%'`);
    expect(rows[0].n).toBe(ROUNDS);
  });

  it("counts every one of a variant's first impressions", async () => {
    await race(10, (round) => incrementExperimentCounterInSupabase(EXPERIMENT, "d", `${P}v${round}`, "impressions"));
    const { rows } = await query<{ impressions: number }>(`select impressions from public.experiment_variants where variant like 'race\\_itest\\_%'`);
    expect(rows).toHaveLength(ROUNDS);
    expect(rows.every((row) => row.impressions === 10)).toBe(true);
  });

  it("keeps one journal entry per day when the first save is sent twice", async () => {
    await race(4, (round) => saveJournalEntryInSupabase({
      id: `${members[round]}_2026-09-25`, memberId: members[round], entryDate: "2026-09-25",
      mood: "calm", note: "", moonHouse: null, moonRashi: null, updatedAt: new Date().toISOString(),
    }));
    const { rows } = await query<{ n: number }>(`select count(*)::int as n from public.journal_entries where member_id like 'race\\_itest\\_%'`);
    expect(rows[0].n).toBe(ROUNDS);
  });

  it("lets one of two first checkouts claim, and tells the other politely", async () => {
    const outcomes = await race(2, (round) =>
      claimSubscriptionCheckoutInSupabase(members[round], `${P}plan`, ["active", "authenticated"], 60_000).then(() => "claimed", (error: Error) => error.message));
    for (const outcome of outcomes) {
      expect(outcome.sort()).toEqual(["You already have a membership in progress. Manage it from Billing.", "claimed"].sort());
    }
  });

  it("never fails a favourite tapped twice at once", async () => {
    await race(2, (round) => toggleFavoriteInSupabase(members[round], `${P}prac`));
    const { rows } = await query<{ n: number }>(`select count(*)::int as n from public.member_favorites where member_id like 'race\\_itest\\_%'`);
    expect(rows[0].n).toBeLessThanOrEqual(ROUNDS);
  });

  it("creates a system role once when set up twice at once", async () => {
    await race(4, (round) => upsertSystemRoleInSupabase(`${P}role${round}`, "Role", ["bookings"]));
    const { rows } = await query<{ n: number }>(`select count(*)::int as n from public.admin_roles where id like 'race\\_itest\\_%'`);
    expect(rows[0].n).toBe(ROUNDS);
  });
});
