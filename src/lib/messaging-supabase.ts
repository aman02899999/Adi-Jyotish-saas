import "server-only";

import { randomUUID } from "node:crypto";

import { query, queryModel, queryModels, withTransaction } from "@/lib/postgres";

/**
 * Supabase data access for the member/admin inbox.
 *
 * message_threads has member_name and member_email columns, and neither is ever
 * written — sendBookingNotification has always resolved them by joining members at
 * read time. Reading the columns instead would return '' for every copied thread,
 * so this module joins members and leaves the denormalised pair alone.
 *
 * member_email is citext, so it is cast to text on the way out.
 */

export type ThreadDbRow = {
  id: string;
  memberId: string;
  bookingId: string | null;
  subject: string;
  category: string;
  status: string;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  memberName: string;
  memberEmail: string;
};

export type MessageDbRow = {
  id: string;
  threadId: string;
  senderType: string;
  senderName: string;
  body: string;
  readByMember: boolean;
  readByAdmin: boolean;
  createdAt: Date;
};

const THREAD_COLUMNS = `t.id, t.member_id, t.booking_id, t.subject, t.category, t.status,
         t.last_message_at, t.created_at, t.updated_at,
         coalesce(m.name, 'Member') as member_name,
         coalesce(m.email::text, '') as member_email`;

/**
 * Threads with their member details, newest first.
 *
 * The Firestore path fetched the threads, then did one members lookup per thread
 * and one messages query per thread. All three collapse into joins here.
 */
export async function getThreadRowsInSupabase(memberId?: string): Promise<ThreadDbRow[]> {
  return queryModels<ThreadDbRow>(
    `select ${THREAD_COLUMNS}
       from public.message_threads t
       left join public.members m on m.id = t.member_id
      ${memberId ? "where t.member_id = $1" : ""}
      order by t.last_message_at desc, t.id`,
    memberId ? [memberId] : [],
  );
}

/** Every message for the given threads, oldest first within each thread. */
export async function getMessagesForThreadsInSupabase(threadIds: string[]): Promise<MessageDbRow[]> {
  if (!threadIds.length) return [];
  return queryModels<MessageDbRow>(
    `select id, thread_id, sender_type, sender_name, body, read_by_member, read_by_admin, created_at
       from public.inbox_messages
      where thread_id = any($1::text[])
      order by thread_id, created_at asc, id asc`,
    [threadIds],
  );
}

export async function countAdminUnreadInSupabase(): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `select count(*)::int as n from public.inbox_messages
      where sender_type = 'member' and read_by_admin = false`,
  );
  return rows[0]?.n ?? 0;
}

export async function countMemberUnreadInSupabase(memberId: string): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `select count(*)::int as n
       from public.inbox_messages i
       join public.message_threads t on t.id = i.thread_id
      where t.member_id = $1
        and i.read_by_member = false
        and i.sender_type in ('admin', 'system')`,
    [memberId],
  );
  return rows[0]?.n ?? 0;
}

export async function findMemberIdByEmailInSupabase(email: string): Promise<string | null> {
  const row = await queryModel<{ id: string }>(
    `select id from public.members where email = $1 limit 1`,
    [email],
  );
  return row?.id ?? null;
}

export type BookingThreadOutcome = { threadId: string; created: boolean };

/**
 * Finds the member's thread for this booking, or opens one.
 *
 * Firestore did a query and then a create, so two notifications for the same
 * booking arriving together could each open a thread and the member would see the
 * same subject twice. There is no unique constraint on (member_id, booking_id) to
 * lean on — copied data may already contain duplicates — so an advisory lock keyed
 * on the pair serialises the find-or-create instead.
 */
export async function findOrCreateBookingThreadInSupabase(input: {
  memberId: string;
  bookingId: string;
  subject: string;
}): Promise<BookingThreadOutcome> {
  return withTransaction(async (client) => {
    await client.query(
      `select pg_advisory_xact_lock(hashtextextended($1 || $2 || ':' || $3, 0))`,
      ["booking-thread:", input.memberId, input.bookingId],
    );

    const existing = await client.query<{ id: string }>(
      `select id from public.message_threads
        where member_id = $1 and booking_id = $2
        order by created_at asc limit 1`,
      [input.memberId, input.bookingId],
    );

    if (existing.rows[0]?.id) {
      await client.query(
        `update public.message_threads
            set subject = $2, status = 'open', last_message_at = now(), updated_at = now()
          where id = $1`,
        [existing.rows[0].id, input.subject],
      );
      return { threadId: existing.rows[0].id, created: false };
    }

    const id = randomUUID();
    await client.query(
      `insert into public.message_threads
         (id, member_id, booking_id, subject, category, status, last_message_at, created_at, updated_at)
       values ($1, $2, $3, $4, 'booking', 'open', now(), now(), now())`,
      [id, input.memberId, input.bookingId, input.subject],
    );
    return { threadId: id, created: true };
  });
}

export async function insertSystemMessageInSupabase(threadId: string, body: string): Promise<MessageDbRow | null> {
  // The id is generated here: inbox_messages.id has no default because copied rows
  // carry their verbatim Firestore document id.
  return queryModel<MessageDbRow>(
    `insert into public.inbox_messages
       (id, thread_id, sender_type, sender_name, body, read_by_admin, read_by_member, created_at)
     values ($1, $2, 'system', 'Adi Jyotish Guru', $3, true, false, now())
     returning id, thread_id, sender_type, sender_name, body, read_by_member, read_by_admin, created_at`,
    [randomUUID(), threadId, body],
  );
}
