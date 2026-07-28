import "server-only";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers, messageThreads, threadMessages } from "@/db/schema";

export type InboxMessage = {
  id: number;
  threadId: number;
  senderType: string;
  senderName: string;
  body: string;
  readByMember: boolean;
  readByAdmin: boolean;
  createdAt: Date;
};

export type InboxThread = {
  id: number;
  memberId: number;
  bookingId: number | null;
  subject: string;
  category: string;
  status: string;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  memberName: string;
  memberEmail: string;
  messages: InboxMessage[];
};

async function attachMessages<T extends Omit<InboxThread, "messages">>(threads: T[]): Promise<InboxThread[]> {
  if (!threads.length) return [];
  const messages = await db.select().from(threadMessages).where(inArray(threadMessages.threadId, threads.map((thread) => thread.id))).orderBy(threadMessages.createdAt);
  const messagesByThread = new Map<number, InboxMessage[]>();
  for (const message of messages) {
    const group = messagesByThread.get(message.threadId) ?? [];
    group.push(message);
    messagesByThread.set(message.threadId, group);
  }
  return threads.map((thread) => ({ ...thread, messages: messagesByThread.get(thread.id) ?? [] }));
}

export async function getAdminInbox() {
  const threads = await db.select({
    id: messageThreads.id,
    memberId: messageThreads.memberId,
    bookingId: messageThreads.bookingId,
    subject: messageThreads.subject,
    category: messageThreads.category,
    status: messageThreads.status,
    lastMessageAt: messageThreads.lastMessageAt,
    createdAt: messageThreads.createdAt,
    updatedAt: messageThreads.updatedAt,
    memberName: memberUsers.name,
    memberEmail: memberUsers.email,
  }).from(messageThreads).innerJoin(memberUsers, eq(messageThreads.memberId, memberUsers.id)).orderBy(desc(messageThreads.lastMessageAt));
  return attachMessages(threads);
}

export async function getMemberInbox(memberId: number) {
  const threads = await db.select({
    id: messageThreads.id,
    memberId: messageThreads.memberId,
    bookingId: messageThreads.bookingId,
    subject: messageThreads.subject,
    category: messageThreads.category,
    status: messageThreads.status,
    lastMessageAt: messageThreads.lastMessageAt,
    createdAt: messageThreads.createdAt,
    updatedAt: messageThreads.updatedAt,
    memberName: memberUsers.name,
    memberEmail: memberUsers.email,
  }).from(messageThreads).innerJoin(memberUsers, eq(messageThreads.memberId, memberUsers.id)).where(eq(messageThreads.memberId, memberId)).orderBy(desc(messageThreads.lastMessageAt));
  return attachMessages(threads);
}

export async function getAdminUnreadCount() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(threadMessages).where(and(eq(threadMessages.senderType, "member"), eq(threadMessages.readByAdmin, false)));
  return row?.count ?? 0;
}

export async function getMemberUnreadCount(memberId: number) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(threadMessages)
    .innerJoin(messageThreads, eq(threadMessages.threadId, messageThreads.id))
    .where(and(eq(messageThreads.memberId, memberId), eq(threadMessages.readByMember, false), or(eq(threadMessages.senderType, "admin"), eq(threadMessages.senderType, "system"))));
  return row?.count ?? 0;
}

export async function sendBookingNotification({
  memberEmail,
  bookingId,
  subject,
  body,
}: {
  memberEmail: string;
  bookingId: number;
  subject: string;
  body: string;
}) {
  const [member] = await db.select({ id: memberUsers.id }).from(memberUsers).where(eq(memberUsers.email, memberEmail.toLowerCase())).limit(1);
  if (!member) return null;

  return db.transaction(async (tx) => {
    let [thread] = await tx.select().from(messageThreads).where(and(eq(messageThreads.memberId, member.id), eq(messageThreads.bookingId, bookingId))).limit(1);
    const now = new Date();
    if (!thread) {
      [thread] = await tx.insert(messageThreads).values({ memberId: member.id, bookingId, subject, category: "booking", status: "open", lastMessageAt: now }).returning();
    } else {
      await tx.update(messageThreads).set({ subject, status: "open", lastMessageAt: now, updatedAt: now }).where(eq(messageThreads.id, thread.id));
    }
    const [message] = await tx.insert(threadMessages).values({
      threadId: thread.id,
      senderType: "system",
      senderName: "Jyotish Studio",
      body: body.trim().slice(0, 3000),
      readByAdmin: true,
      readByMember: false,
    }).returning();
    return message;
  });
}
