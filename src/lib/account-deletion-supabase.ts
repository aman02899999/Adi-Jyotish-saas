import "server-only";

import { queryModel, queryModels, withTransaction } from "@/lib/postgres";
import {
  ANONYMIZED_NAME,
  anonymizedEmailFor,
} from "@/lib/account-privacy";
import type { MemberIdentity } from "@/lib/member-auth";

/**
 * Postgres implementation of the self-service export and erasure flows.
 *
 * THE IMPORTANT DIFFERENCE. The Firestore version enumerates by hand every collection a member
 * owns and deletes each one, because Firestore has no referential integrity to lean on. Postgres
 * does: migration 0011 aligned every members foreign key with this policy, so `delete from
 * members` cascades through the 17 owned tables and detaches the 12 retained ones in a single
 * statement. This module therefore does NOT re-enumerate what cascade already handles — doing so
 * would create a second copy of the policy that could drift from the constraints.
 *
 * What the database cannot do is anonymize. `on delete set null` clears the foreign key and
 * nothing else: client_name, client_email, customer_name, shipping_line1 and the rest survive
 * untouched. So the shape here is deliberately:
 *
 *     1. scrub the PII on rows that are retained   (application)
 *     2. delete the member                          (one statement; cascade does the rest)
 *
 * and the order matters, because after step 2 there is no member_id left to find those rows by.
 *
 * COSMIC WEATHER. The Firestore path treats cosmicWeather as member-owned (doc id == uid). The
 * Postgres table is keyed by `day` with no member_id at all — it is a global daily almanac, not
 * per-member data. It is deliberately absent from both the export and the erasure here; there is
 * nothing member-specific in it to return or remove.
 */

/** Columns that must never leave the server in an export. Mirrors EXPORT_EXCLUDED_MEMBER_FIELDS
 * in account-privacy.ts, in this schema's snake_case. */
const MEMBER_EXPORT_COLUMNS = `
  id, name, email, phone, birth_date, birth_time, birth_place, plan, onboarding_complete,
  active, email_verified, totp_enabled, is_demo_account, locale, referral_code,
  last_login_at, created_at, updated_at
`;

/** Tables the member owns outright, read for the export. Cascade removes them on delete, so this
 * list exists only so the export can return them — it is not a deletion list. */
const OWNED_TABLES: Array<{ table: string; column: string; key: string }> = [
  { table: "journal_entries", column: "member_id", key: "journalEntries" },
  { table: "ai_readings", column: "member_id", key: "aiReadings" },
  { table: "kundli_matches", column: "member_id", key: "kundliMatches" },
  { table: "numerology_readings", column: "member_id", key: "numerologyReadings" },
  { table: "gemstone_recommendations", column: "member_id", key: "gemstoneRecommendations" },
  { table: "predictions", column: "member_id", key: "predictions" },
  { table: "message_threads", column: "member_id", key: "messageThreads" },
  { table: "member_favorites", column: "member_id", key: "favorites" },
  { table: "gemstone_wishlist", column: "member_id", key: "wishlist" },
  { table: "family_members", column: "member_id", key: "familyMembers" },
  { table: "cosmic_profile_cards", column: "member_id", key: "cosmicProfileCard" },
  { table: "member_streaks", column: "member_id", key: "memberStreak" },
  { table: "ai_reading_free_claims", column: "member_id", key: "aiReadingFreeClaims" },
  { table: "milestones", column: "member_id", key: "milestones" },
];

async function rows(sql: string, params: readonly unknown[]): Promise<unknown[]> {
  return (await queryModels<Record<string, unknown>>(sql, params)) as unknown[];
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export async function buildMemberDataExportInSupabase(
  member: MemberIdentity,
): Promise<Record<string, unknown>> {
  const [profile, bookings, invoices, subscription, subscriptionInvoices, wallet, walletLedger,
    notifications, gemstoneOrders, gemstoneReviews, practitionerReviews, giftCards, chatSessions,
    referrals] = await Promise.all([
    queryModel<Record<string, unknown>>(`select ${MEMBER_EXPORT_COLUMNS} from public.members where id = $1`, [member.id]),
    // Bookings and invoices join on the member's email, matching the Firestore path: a booking
    // made before the account existed still belongs to the person who made it.
    rows(`select * from public.bookings where member_id = $1 or client_email = $2 order by created_at`, [member.id, member.email]),
    rows(`select * from public.invoices where member_id = $1 or customer_email = $2 order by created_at`, [member.id, member.email]),
    queryModel<Record<string, unknown>>(`select * from public.member_subscriptions where member_id = $1`, [member.id]),
    rows(`select * from public.subscription_invoices where member_id = $1 order by created_at`, [member.id]),
    queryModel<Record<string, unknown>>(`select * from public.wallets where member_id = $1`, [member.id]),
    rows(`select e.* from public.wallet_entries e join public.wallets w on w.id = e.wallet_id
          where w.member_id = $1 order by e.created_at`, [member.id]),
    rows(`select * from public.notifications where recipient_id = $1 and recipient_type = 'member' order by created_at`, [member.id]),
    rows(`select * from public.gemstone_orders where member_id = $1 order by created_at`, [member.id]),
    rows(`select * from public.gemstone_reviews where member_id = $1 order by created_at`, [member.id]),
    rows(`select * from public.practitioner_reviews where member_id = $1 order by created_at`, [member.id]),
    rows(`select * from public.gift_cards where buyer_id = $1 order by created_at`, [member.id]),
    rows(`select * from public.chat_sessions where member_id = $1 order by created_at`, [member.id]),
    // As a referee this record is theirs; rows where they are the referrer belong to the people
    // they referred, so they are not exported here.
    rows(`select * from public.referrals where referee_id = $1 order by created_at`, [member.id]),
  ]);

  const owned: Record<string, unknown> = {};
  for (const { table, column, key } of OWNED_TABLES) {
    owned[key] = await rows(`select * from public.${table} where ${column} = $1`, [member.id]);
  }

  return {
    exportedAt: new Date().toISOString(),
    format: "adi-jyotish-guru/member-data-export.v1",
    profile,
    bookings,
    invoices,
    subscription,
    subscriptionInvoices,
    wallet,
    walletLedger,
    notifications,
    gemstoneOrders,
    gemstoneReviews,
    practitionerReviews,
    giftCardsPurchased: giftCards,
    chatSessions,
    referrals,
    ...owned,
  };
}

/* ------------------------------------------------------------------ */
/* Blockers                                                            */
/* ------------------------------------------------------------------ */

export async function getDeletionBlockersInSupabase(member: MemberIdentity): Promise<string[]> {
  const blockers: string[] = [];

  const wallet = await queryModel<{ balance: number | null }>(
    `select balance from public.wallets where member_id = $1`,
    [member.id],
  );
  // numeric(14,2) arrives as a string from node-postgres; rowToCamel's numeric coercion is not in
  // play for a bare select, so parse explicitly rather than comparing a string to 0.
  const balance = Number(wallet?.balance ?? 0);
  if (balance > 0) {
    blockers.push(`Your wallet still holds ₹${balance}. Spend it or write to support for a refund before deleting your account.`);
  }

  const active = await queryModel<{ id: string }>(
    `select id from public.chat_sessions where member_id = $1 and status = 'active' limit 1`,
    [member.id],
  );
  if (active) {
    blockers.push("You have a live chat session in progress. End it before deleting your account.");
  }

  return blockers;
}

/* ------------------------------------------------------------------ */
/* Deletion                                                            */
/* ------------------------------------------------------------------ */

/**
 * Scrubs the PII from rows that outlive the member, then deletes the member row and lets the
 * foreign keys do the structural work. Runs in one transaction: a partial anonymization followed
 * by a failed delete would leave a live account with its own name scrubbed, which is worse than
 * either outcome alone.
 */
export async function deleteMemberAccountInSupabase(member: MemberIdentity): Promise<void> {
  const anonEmail = anonymizedEmailFor(member.id);

  await withTransaction(async (client) => {
    // Bookings: practitioner earnings, GST and dispute history hang off these, so the row stays
    // and every personal field goes. client_email is the join key invoices use, so both sides get
    // the same token.
    await client.query(
      `update public.bookings
          set client_name = $2, client_email = $3, client_phone = null,
              birth_date = '', birth_time = '', birth_place = '',
              notes = null, kundli_summary = null, varshphal_summary = null,
              member_id = null, updated_at = now()
        where member_id = $1 or client_email = $4`,
      [member.id, ANONYMIZED_NAME, anonEmail, member.email],
    );

    // Invoices are legally retained for GST — scrub the person, keep the money.
    await client.query(
      `update public.invoices
          set customer_name = $2, customer_email = $3, member_id = null, updated_at = now()
        where member_id = $1 or customer_email = $4`,
      [member.id, ANONYMIZED_NAME, anonEmail, member.email],
    );

    // Gemstone orders: city/state/pincode stay because place of supply determines GST treatment.
    await client.query(
      `update public.gemstone_orders
          set guest_name = null, guest_email = null, guest_phone = null,
              shipping_name = $2, shipping_phone = '', shipping_line1 = 'Removed',
              shipping_line2 = null, member_id = null, updated_at = now()
        where member_id = $1`,
      [member.id, ANONYMIZED_NAME],
    );

    // Financial records that survive the subscription itself (see migration 0011).
    await client.query(`update public.subscription_invoices set member_id = null where member_id = $1`, [member.id]);

    // Published reviews remain part of the practitioner's/product's public record, detached.
    await client.query(
      `update public.gemstone_reviews set member_id = null, reviewer_name = $2, updated_at = now() where member_id = $1`,
      [member.id, ANONYMIZED_NAME],
    );
    await client.query(
      `update public.practitioner_reviews set member_id = null, reviewer_name = $2, updated_at = now() where member_id = $1`,
      [member.id, ANONYMIZED_NAME],
    );

    // Gift cards stay redeemable/redeemed as financial records. The recipient name and message
    // were written by the buyer and can identify them, so both are scrubbed too.
    await client.query(
      `update public.gift_cards
          set buyer_name = $2, recipient_name = 'a friend', message = '', buyer_id = null
        where buyer_id = $1`,
      [member.id, ANONYMIZED_NAME],
    );
    await client.query(`update public.gift_cards set redeemed_by = null where redeemed_by = $1`, [member.id]);

    // Chat transcripts are the member's PII and go; the session row carries captured_amount,
    // which is summed for practitioner payouts, so it stays with its member link cleared.
    // 0011 made member_id nullable for exactly this.
    await client.query(
      `delete from public.chat_messages
        where session_id in (select id from public.chat_sessions where member_id = $1)`,
      [member.id],
    );
    await client.query(`update public.chat_sessions set member_id = null, updated_at = now() where member_id = $1`, [member.id]);

    // Member-scoped notifications are not reachable by foreign key (recipient_id is polymorphic
    // across members and practitioners, so it carries no constraint), so they need an explicit
    // delete — cascade will not find them.
    await client.query(`delete from public.notifications where recipient_id = $1 and recipient_type = 'member'`, [member.id]);

    // Everything the member owns goes with this one statement: migration 0011 aligned all 17
    // cascading foreign keys with the policy above.
    await client.query(`delete from public.members where id = $1`, [member.id]);

    // A self-deletion is audit-worthy even with no admin actor.
    await client.query(
      `insert into public.audit_logs (id, admin_id, admin_name, action, entity_type, entity_id, details, created_at)
       values (gen_random_uuid()::text, null, $1, 'member.self_deleted', 'member', $2, null, now())`,
      [ANONYMIZED_NAME, member.id],
    );
  });
}
