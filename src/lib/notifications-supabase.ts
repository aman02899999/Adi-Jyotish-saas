import "server-only";

import { randomUUID } from "node:crypto";

import { query, queryModels } from "@/lib/postgres";

// Data access for in-app notifications. Truncation, the link sanitiser and the
// recipient-type union stay in notifications.ts so both providers apply the same
// rules to the same input.

export type NotificationRow = {
  id: string;
  recipientType: string;
  recipientId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationInsert = {
  recipientType: string;
  recipientId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
};

export async function createNotificationInSupabase(input: NotificationInsert): Promise<void> {
  await query(
    `insert into public.notifications (id, recipient_type, recipient_id, type, title, body, link)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), input.recipientType, input.recipientId, input.type, input.title, input.body, input.link],
  );
}

/** The Firestore path used a write batch; this is one statement, so a fan-out to
 * every admin cannot partially apply. */
export async function createNotificationsInSupabase(recipientIds: string[], input: Omit<NotificationInsert, "recipientType" | "recipientId">): Promise<void> {
  if (!recipientIds.length) return;
  const values: unknown[] = [];
  const tuples = recipientIds.map((recipientId) => {
    const base = values.length;
    values.push(randomUUID(), "admin", recipientId, input.type, input.title, input.body, input.link);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
  });
  await query(
    `insert into public.notifications (id, recipient_type, recipient_id, type, title, body, link)
     values ${tuples.join(", ")}`,
    values,
  );
}

export async function getNotificationsInSupabase(recipientType: string, recipientId: string, limit: number): Promise<NotificationRow[]> {
  return queryModels<NotificationRow>(
    `select id, recipient_type, recipient_id, type, title, body, link, read_at, created_at
       from public.notifications
      where recipient_type = $1 and recipient_id = $2
      order by created_at desc
      limit $3`,
    [recipientType, recipientId, limit],
  );
}

export async function getUnreadCountInSupabase(recipientType: string, recipientId: string): Promise<number> {
  // count(*) is bigint, which node-postgres returns as a string; the ::int cast
  // keeps the caller's arithmetic arithmetic.
  const result = await query(
    `select count(*)::int as count
       from public.notifications
      where recipient_type = $1 and recipient_id = $2 and read_at is null`,
    [recipientType, recipientId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** Ownership is enforced in the WHERE clause rather than by a read-then-check, so
 * there is no window between checking the recipient and stamping the row. */
export async function markNotificationReadInSupabase(id: string, recipientType: string, recipientId: string): Promise<void> {
  await query(
    `update public.notifications
        set read_at = now()
      where id = $1 and recipient_type = $2 and recipient_id = $3`,
    [id, recipientType, recipientId],
  );
}

export async function markAllNotificationsReadInSupabase(recipientType: string, recipientId: string): Promise<void> {
  await query(
    `update public.notifications
        set read_at = now()
      where recipient_type = $1 and recipient_id = $2 and read_at is null`,
    [recipientType, recipientId],
  );
}
