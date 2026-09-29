import "server-only";

import { GENUINE_REVIEW_SQL } from "@/lib/review-provenance";
import { isUniqueViolation, query, queryModel, queryModels } from "@/lib/postgres";
import { rowToCamel } from "@/lib/postgres-mapping";

/**
 * Postgres implementation of the chat tables.
 *
 * Data access only: SQL and row normalisation. The pricing rules, the AI-reply
 * policy and the Ably publishing all stay in chat.ts so both layers are driven by
 * the same logic.
 *
 * THE LOCK. Firestore's `chatActiveLocks/{memberId}` doc used `create()`, which
 * fails if the document already exists — that failure *is* the mutex that stops two
 * concurrent start-session calls both reserving a wallet hold. The Postgres
 * equivalent is a unique primary key plus `on conflict do nothing`, and the
 * inserted-row count tells us who won. Catching a 23505 would also work; checking
 * rowCount avoids raising and handling an error on the ordinary path.
 *
 * The practitioner, member and review-count reads below are deliberately narrow
 * read-only lookups scoped to what chat needs. They exist so chat can be ported
 * without first porting the practitioner and member modules; when those are ported
 * these should be replaced by calls into them.
 */

export type ChatSessionRow = {
  id: string;
  memberId: string;
  practitionerId: string;
  walletHoldId: string | null;
  pricingModel: "metered" | "fixed";
  ratePerMinute: number;
  fixedPrice: number | null;
  status: string;
  capturedAmount: number | null;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatMessageRow = {
  id: string;
  sessionId: string;
  senderType: string;
  senderName: string;
  body: string;
  createdAt: Date;
};

export type ChatPractitionerRow = {
  id: string;
  name: string;
  slug: string;
  title: string;
  bio: string;
  specialties: string;
  active: boolean;
  online: boolean;
  chatRatePerMinute: number;
  isAiPowered: boolean;
  isDemoAccount: boolean;
};

type RawSessionRow = Omit<ChatSessionRow, "ratePerMinute" | "fixedPrice" | "capturedAmount"> & {
  ratePerMinute: number | string | null;
  fixedPrice: number | string | null;
  capturedAmount: number | string | null;
};

type RawPractitionerRow = Omit<ChatPractitionerRow, "chatRatePerMinute"> & {
  chatRatePerMinute: number | string | null;
};

const SESSION_COLUMNS = `id, member_id, practitioner_id, wallet_hold_id, pricing_model,
       rate_per_minute, fixed_price, status, captured_amount,
       started_at, ended_at, created_at, updated_at`;

// numeric columns arrive as strings from node-postgres; listing them is what keeps
// arithmetic arithmetic instead of concatenation.
const SESSION_NUMERIC = ["ratePerMinute", "fixedPrice", "capturedAmount"] as const;
const PRACTITIONER_NUMERIC = ["chatRatePerMinute"] as const;

/**
 * What a raw `query()` returns — snake_case keys, numeric as a string.
 *
 * queryModel/queryModels apply rowToCamel for us, but the `returning` clauses
 * below go through plain query(), so they must be mapped explicitly. Typing them
 * as RawSessionRow compiles and silently yields `pricingModel: undefined`.
 */
type SqlSessionRow = {
  id: string;
  member_id: string;
  practitioner_id: string;
  wallet_hold_id: string | null;
  pricing_model: "metered" | "fixed";
  rate_per_minute: number | string | null;
  fixed_price: number | string | null;
  status: string;
  captured_amount: number | string | null;
  started_at: Date;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapSessionRow(row: SqlSessionRow): ChatSessionRow {
  return toSession(rowToCamel<RawSessionRow>(row as unknown as Record<string, unknown>, SESSION_NUMERIC));
}

/** Raw shape of a chat_messages row from a `returning` clause. */
type SqlMessageRow = {
  id: string;
  session_id: string;
  sender_type: string;
  sender_name: string;
  body: string;
  created_at: Date;
};

const PRACTITIONER_COLUMNS = `id, name, slug, title, bio, specialties, active, online,
       chat_rate_per_minute, is_ai_powered, is_demo_account`;

/** Coerces the three nullable money columns, leaving null as null. */
function toSession(row: RawSessionRow): ChatSessionRow {
  return {
    ...row,
    ratePerMinute: toNum(row.ratePerMinute, 0),
    fixedPrice: row.fixedPrice === null || row.fixedPrice === undefined ? null : toNum(row.fixedPrice, 0),
    capturedAmount: row.capturedAmount === null || row.capturedAmount === undefined ? null : toNum(row.capturedAmount, 0),
  };
}

function toNum(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? fallback : n;
}

// --- the lock ---------------------------------------------------------------------------------

/**
 * Claims the one-active-chat-per-member lock.
 *
 * Returns false when the member already holds it, which is what the caller turns
 * into ChatSessionConflictError. Race-free by the primary key: two concurrent
 * callers cannot both get rowCount 1.
 */
export async function claimChatLockInSupabase(memberId: string): Promise<boolean> {
  try {
    const result = await query(`insert into public.chat_active_locks (member_id, claimed_at) values ($1, now()) on conflict (member_id) do nothing`, [
      memberId,
    ]);
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    // Defensive: on conflict should absorb the race, but a concurrent insert can
    // still surface as 23505 depending on timing against the unique index.
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

export async function releaseChatLockInSupabase(memberId: string): Promise<void> {
  await query(`delete from public.chat_active_locks where member_id = $1`, [memberId]);
}

// --- sessions ---------------------------------------------------------------------------------

export async function createChatSessionInSupabase(input: {
  memberId: string;
  practitionerId: string;
  walletHoldId: string;
  pricingModel: "metered" | "fixed";
  ratePerMinute: number;
  fixedPrice: number | null;
}): Promise<ChatSessionRow> {
  const { rows } = await query<SqlSessionRow>(
    `insert into public.chat_sessions
       (id, member_id, practitioner_id, wallet_hold_id, pricing_model, rate_per_minute,
        fixed_price, status, captured_amount, started_at, ended_at, created_at, updated_at)
     values (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, 'active', null, now(), null, now(), now())
     returning ${SESSION_COLUMNS}`,
    [input.memberId, input.practitionerId, input.walletHoldId, input.pricingModel, input.ratePerMinute, input.fixedPrice],
  );
  return mapSessionRow(rows[0]!);
}

export async function getChatSessionFromSupabase(sessionId: string): Promise<ChatSessionRow | null> {
  const row = await queryModel<RawSessionRow>(
    `select ${SESSION_COLUMNS} from public.chat_sessions where id = $1`,
    [sessionId],
    SESSION_NUMERIC,
  );
  return row ? toSession(row) : null;
}

/** Marks a session ended and records what was captured. Returns the updated row. */
export async function endChatSessionInSupabase(sessionId: string, capturedAmount: number): Promise<ChatSessionRow | null> {
  const { rows } = await query<SqlSessionRow>(
    `update public.chat_sessions
        set status = 'ended', ended_at = now(), captured_amount = $2, updated_at = now()
      where id = $1
      returning ${SESSION_COLUMNS}`,
    [sessionId, capturedAmount],
  );
  return rows.length ? mapSessionRow(rows[0]!) : null;
}

/** Sessions whose hold window has passed, oldest first, for the stale sweep. */
export async function listStaleActiveChatSessionsFromSupabase(cutoff: Date, limit = 25): Promise<ChatSessionRow[]> {
  const rows = await queryModels<RawSessionRow>(
    `select ${SESSION_COLUMNS} from public.chat_sessions
      where status = 'active' and started_at < $1
      order by started_at asc
      limit $2`,
    [cutoff, limit],
    SESSION_NUMERIC,
  );
  return rows.map(toSession);
}

export async function findActiveChatSessionForMemberFromSupabase(memberId: string): Promise<ChatSessionRow | null> {
  const row = await queryModel<RawSessionRow>(
    `select ${SESSION_COLUMNS} from public.chat_sessions
      where member_id = $1 and status = 'active'
      order by started_at desc
      limit 1`,
    [memberId],
    SESSION_NUMERIC,
  );
  return row ? toSession(row) : null;
}

// --- messages ---------------------------------------------------------------------------------

export async function addChatMessageInSupabase(
  sessionId: string,
  input: { senderType: string; senderName: string; body: string },
): Promise<ChatMessageRow> {
  const { rows } = await query<SqlMessageRow>(
    `insert into public.chat_messages (id, session_id, sender_type, sender_name, body, created_at)
     values (gen_random_uuid()::text, $1, $2, $3, $4, now())
     returning id, session_id, sender_type, sender_name, body, created_at`,
    [sessionId, input.senderType, input.senderName, input.body],
  );
  // This row is handed straight to publishChatEvent, so an unmapped snake_case key
  // would reach the browser as `sender_type` and render as an empty bubble.
  return rowToCamel<ChatMessageRow>(rows[0]! as unknown as Record<string, unknown>);
}

export async function listChatMessagesFromSupabase(sessionId: string): Promise<ChatMessageRow[]> {
  return queryModels<ChatMessageRow>(
    `select id, session_id, sender_type, sender_name, body, created_at
       from public.chat_messages
      where session_id = $1
      order by created_at asc`,
    [sessionId],
  );
}

// --- lookups chat needs -------------------------------------------------------------------------

export async function getChatPractitionerFromSupabase(practitionerId: string): Promise<ChatPractitionerRow | null> {
  const row = await queryModel<RawPractitionerRow>(
    `select ${PRACTITIONER_COLUMNS} from public.practitioners where id = $1`,
    [practitionerId],
    PRACTITIONER_NUMERIC,
  );
  return row ? { ...row, chatRatePerMinute: toNum(row.chatRatePerMinute, 0) } : null;
}

/** Online, non-demo practitioners — the "try someone else" suggestion list. */
export async function listOnlineChatPractitionersFromSupabase(limit: number): Promise<ChatPractitionerRow[]> {
  const rows = await queryModels<RawPractitionerRow>(
    `select ${PRACTITIONER_COLUMNS} from public.practitioners
      where active and online and not is_demo_account
      order by name asc
      limit $1`,
    [limit],
    PRACTITIONER_NUMERIC,
  );
  return rows.map((row) => ({ ...row, chatRatePerMinute: toNum(row.chatRatePerMinute, 0) }));
}

export async function countPublishedPractitionerReviewsFromSupabase(practitionerId: string): Promise<number> {
  const row = await queryModel<{ n: number }>(
    `select count(*)::int as n from public.practitioner_reviews
      where practitioner_id = $1 and status = 'published' and ${GENUINE_REVIEW_SQL}`,
    [practitionerId],
  );
  return row?.n ?? 0;
}

export async function getMemberContactFromSupabase(memberId: string): Promise<{ name: string; email: string } | null> {
  return queryModel<{ name: string; email: string }>(`select name, email::text as email from public.members where id = $1`, [memberId]);
}

// --- admin / practitioner lists -----------------------------------------------------------------

export type AdminChatSessionRow = ChatSessionRow & { memberName: string; memberEmail: string; practitionerName: string };

/**
 * Active sessions with their member and practitioner names.
 *
 * The Firestore version fetched the sessions and then did a batched getAll for
 * every member and practitioner id. Two joins do the same work in one round trip.
 */
export async function listActiveChatSessionsForAdminFromSupabase(): Promise<AdminChatSessionRow[]> {
  return queryModels<AdminChatSessionRow>(
    `select s.id, s.member_id, s.practitioner_id, s.wallet_hold_id, s.pricing_model,
            s.rate_per_minute, s.fixed_price, s.status, s.captured_amount,
            s.started_at, s.ended_at, s.created_at, s.updated_at,
            coalesce(m.name, 'Member') as member_name,
            coalesce(m.email::text, '') as member_email,
            coalesce(p.name, 'Practitioner') as practitioner_name
       from public.chat_sessions s
       left join public.members m on m.id = s.member_id
       left join public.practitioners p on p.id = s.practitioner_id
      where s.status = 'active'
      order by s.started_at desc`,
    [],
    [...SESSION_NUMERIC],
  );
}

export type PractitionerChatSessionRow = ChatSessionRow & { memberName: string };

export async function listChatSessionsForPractitionerFromSupabase(practitionerId: string, limit = 30): Promise<PractitionerChatSessionRow[]> {
  return queryModels<PractitionerChatSessionRow>(
    `select s.id, s.member_id, s.practitioner_id, s.wallet_hold_id, s.pricing_model,
            s.rate_per_minute, s.fixed_price, s.status, s.captured_amount,
            s.started_at, s.ended_at, s.created_at, s.updated_at,
            coalesce(m.name, 'Member') as member_name
       from public.chat_sessions s
       left join public.members m on m.id = s.member_id
      where s.practitioner_id = $1
      order by s.started_at desc
      limit $2`,
    [practitionerId, limit],
    [...SESSION_NUMERIC],
  );
}
