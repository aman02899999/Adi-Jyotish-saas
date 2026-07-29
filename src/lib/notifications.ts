import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";

type RecipientType = "member" | "admin";

export async function createNotification(input: { recipientType: RecipientType; recipientId: number; type: string; title: string; body?: string; link?: string }) {
  await db.insert(notifications).values({
    recipientType: input.recipientType,
    recipientId: input.recipientId,
    type: input.type.slice(0, 60),
    title: input.title.slice(0, 160),
    body: input.body?.slice(0, 2000),
    link: input.link?.slice(0, 300),
  });
}

/** Fan-out helper for notifying every active admin who holds a given permission (e.g. all owners/managers about a new order). */
export async function notifyAdmins(adminIds: number[], input: { type: string; title: string; body?: string; link?: string }) {
  if (!adminIds.length) return;
  await db.insert(notifications).values(adminIds.map((recipientId) => ({
    recipientType: "admin" as const,
    recipientId,
    type: input.type.slice(0, 60),
    title: input.title.slice(0, 160),
    body: input.body?.slice(0, 2000),
    link: input.link?.slice(0, 300),
  })));
}

export async function getNotifications(recipientType: RecipientType, recipientId: number, limit = 30) {
  return db.select().from(notifications)
    .where(and(eq(notifications.recipientType, recipientType), eq(notifications.recipientId, recipientId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadCount(recipientType: RecipientType, recipientId: number) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications)
    .where(and(eq(notifications.recipientType, recipientType), eq(notifications.recipientId, recipientId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

export async function markNotificationRead(id: number, recipientType: RecipientType, recipientId: number) {
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.recipientType, recipientType), eq(notifications.recipientId, recipientId)));
}

export async function markAllNotificationsRead(recipientType: RecipientType, recipientId: number) {
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.recipientType, recipientType), eq(notifications.recipientId, recipientId), isNull(notifications.readAt)));
}
