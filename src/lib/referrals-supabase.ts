import "server-only";

import { isUniqueViolation, query, queryModel, withTransaction } from "@/lib/postgres";

/**
 * Supabase data access for referrals. Data access only; the reward amounts, the
 * milestone list and the notification copy all stay in referrals.ts.
 *
 * `referrals.referrer_id`, `.code` and `.status` were added by migration 0010 —
 * before that the table had only columns inferred from a type, none of which any
 * code path writes.
 */

const LOCK_PREFIX = "referral-cap:";

export type ReferralRow = { id: string; referrerId: string; status: string };

/** Reads the member's referral code, or null if they do not have one yet. */
export async function getReferralCodeInSupabase(memberId: string): Promise<string | null> {
  const row = await queryModel<{ referralCode: string | null }>(
    `select referral_code from public.members where id = $1`,
    [memberId],
  );
  return row?.referralCode ?? null;
}

/**
 * Assigns the code only if the member still has none, and only if no other member
 * holds it.
 *
 * Firestore checked for a clash and then wrote, so two signups generating the same
 * code could both pass the check. The partial unique index on
 * members.referral_code is what actually decides here, and `referral_code is null`
 * makes two concurrent allocations for the same member resolve to one winner
 * instead of both writing.
 */
export async function allocateReferralCodeInSupabase(
  memberId: string,
  code: string,
): Promise<{ kind: "allocated"; code: string } | { kind: "code_taken" } | { kind: "already_set"; code: string }> {
  try {
    const result = await query(
      `update public.members set referral_code = $2
        where id = $1 and referral_code is null`,
      [memberId, code],
    );
    if (result.rowCount === 1) return { kind: "allocated", code };
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: "code_taken" };
    throw error;
  }
  // Zero rows means someone set it first — hand back theirs rather than looping.
  const existing = await getReferralCodeInSupabase(memberId);
  return existing ? { kind: "already_set", code: existing } : { kind: "code_taken" };
}

/** This member's referral, if they have one. The reward path reads it before
 * crediting the referee, so a member with no pending referral is never credited. */
export async function getReferralInSupabase(refereeId: string): Promise<ReferralRow | null> {
  return queryModel<ReferralRow>(
    `select id, referrer_id, status from public.referrals where id = $1`,
    [refereeId],
  );
}

export async function findMemberIdByReferralCodeInSupabase(code: string): Promise<string | null> {
  const row = await queryModel<{ id: string }>(
    `select id from public.members where referral_code = $1 limit 1`,
    [code],
  );
  return row?.id ?? null;
}

/** Records a pending referral. Returns false if this referee already has one. */
export async function insertReferralInSupabase(input: {
  refereeId: string;
  referrerId: string;
  code: string;
}): Promise<boolean> {
  const result = await query(
    `insert into public.referrals (id, referee_id, referrer_id, code, status, created_at)
     values ($1, $1, $2, $3, 'pending', now())
     on conflict (id) do nothing`,
    [input.refereeId, input.referrerId, input.code],
  );
  return result.rowCount === 1;
}

export type ReferralRewardOutcome =
  | { kind: "none" }
  | { kind: "capped" }
  | { kind: "rewarded"; referrerId: string; newRewardedTotal: number };

/**
 * Flips a pending referral to rewarded, or to capped once the referrer is over the
 * limit, and reports which.
 *
 * The count and the flip have to be atomic per referrer: two referees of the same
 * referrer completing a qualifying recharge together would otherwise both read the
 * same pre-increment count and both credit the referrer, which is exactly the hole
 * the Firestore version closed with a transaction that retried on read conflict.
 * Postgres has no equivalent automatic retry, so an advisory lock keyed on the
 * referrer serialises the pair instead — and unlike a row lock it also covers the
 * count, which spans rows this transaction does not otherwise touch.
 */
export async function settleReferralRewardInSupabase(
  refereeId: string,
  maxRewardedPerReferrer: number,
): Promise<ReferralRewardOutcome> {
  return withTransaction(async (client) => {
    const pending = await client.query<{ referrer_id: string }>(
      `select referrer_id from public.referrals where id = $1 and status = 'pending'`,
      [refereeId],
    );
    const referrerId = pending.rows[0]?.referrer_id;
    if (!referrerId) return { kind: "none" as const };

    await client.query(`select pg_advisory_xact_lock(hashtextextended($1 || $2, 0))`, [LOCK_PREFIX, referrerId]);

    // Counted after the lock, so it cannot be stale by the time the flip happens.
    const counted = await client.query<{ n: number }>(
      `select count(*)::int as n from public.referrals where referrer_id = $1 and status = 'rewarded'`,
      [referrerId],
    );
    const currentCount = counted.rows[0]?.n ?? 0;
    const capped = currentCount >= maxRewardedPerReferrer;

    const updated = await client.query(
      `update public.referrals
          set status = $2, rewarded_at = now()
        where id = $1 and status = 'pending'`,
      [refereeId, capped ? "capped" : "rewarded"],
    );
    // Lost the race to a concurrent settle; the winner's outcome stands.
    if (updated.rowCount !== 1) return { kind: "none" as const };

    return capped
      ? { kind: "capped" as const }
      : { kind: "rewarded" as const, referrerId, newRewardedTotal: currentCount + 1 };
  });
}

export async function getReferralCountsInSupabase(referrerId: string): Promise<{ invited: number; rewarded: number }> {
  const row = await queryModel<{ invited: number; rewarded: number }>(
    `select count(*)::int as invited,
            count(*) filter (where status = 'rewarded')::int as rewarded
       from public.referrals
      where referrer_id = $1`,
    [referrerId],
  );
  return { invited: row?.invited ?? 0, rewarded: row?.rewarded ?? 0 };
}
