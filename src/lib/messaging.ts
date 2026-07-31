import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

export type InboxMessage = {
  id: string;
  threadId: string;
  senderType: string;
  senderName: string;
  body: string;
  readByMember: boolean;
  readByAdmin: boolean;
  createdAt: Date;
};

export type InboxThread = {
  id: string;
  memberId: string;
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

type ThreadDoc = {
  memberId: string;
  bookingId: number | null;
  subject: string;
  category: string;
  status: string;
  lastMessageAt: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
};

type MessageDoc = {
  senderType: string;
  senderName: string;
  body: string;
  readByMember: boolean;
  readByAdmin: boolean;
  createdAt: FirebaseFirestore.Timestamp;
};

const threadsCollection = db.collection("messageThreads");

function messagesCollection(threadId: string) {
  return threadsCollection.doc(threadId).collection("messages");
}

function toMessage(threadId: string, doc: FirebaseFirestore.DocumentSnapshot): InboxMessage {
  const data = doc.data() as MessageDoc;
  return { id: doc.id, threadId, senderType: data.senderType, senderName: data.senderName, body: data.body, readByMember: data.readByMember, readByAdmin: data.readByAdmin, createdAt: data.createdAt?.toDate() ?? new Date() };
}

async function attachMessages<T extends { id: string }>(threads: T[]): Promise<Array<T & { messages: InboxMessage[] }>> {
  if (!threads.length) return [];
  const withMessages = await Promise.all(threads.map(async (thread) => {
    const snap = await messagesCollection(thread.id).orderBy("createdAt", "asc").get();
    return { ...thread, messages: snap.docs.map((doc) => toMessage(thread.id, doc)) };
  }));
  return withMessages;
}

async function attachMemberDetails(rows: Array<{ id: string; memberId: string; bookingId: number | null; subject: string; category: string; status: string; lastMessageAt: Date; createdAt: Date; updatedAt: Date }>): Promise<Array<Omit<InboxThread, "messages">>> {
  const memberIds = Array.from(new Set(rows.map((row) => row.memberId)));
  const memberDocs = memberIds.length ? await db.getAll(...memberIds.map((id) => db.collection("members").doc(id))) : [];
  const memberById = new Map(memberDocs.map((doc) => [doc.id, doc.data() as { name?: string; email?: string } | undefined]));

  return rows.map((row) => ({
    ...row,
    memberName: memberById.get(row.memberId)?.name ?? "Member",
    memberEmail: memberById.get(row.memberId)?.email ?? "",
  }));
}

function threadRowFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data() as ThreadDoc;
  return {
    id: doc.id,
    memberId: data.memberId,
    bookingId: data.bookingId ?? null,
    subject: data.subject,
    category: data.category,
    status: data.status,
    lastMessageAt: data.lastMessageAt?.toDate() ?? new Date(),
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

export async function getAdminInbox(): Promise<InboxThread[]> {
  const snap = await threadsCollection.orderBy("lastMessageAt", "desc").get();
  const rows = await attachMemberDetails(snap.docs.map(threadRowFromDoc));
  return attachMessages(rows);
}

export async function getMemberInbox(memberId: string): Promise<InboxThread[]> {
  const snap = await threadsCollection.where("memberId", "==", memberId).orderBy("lastMessageAt", "desc").get();
  const rows = await attachMemberDetails(snap.docs.map(threadRowFromDoc));
  return attachMessages(rows);
}

export async function getAdminUnreadCount() {
  // collectionGroup query across every thread's messages subcollection.
  const snap = await db.collectionGroup("messages").where("senderType", "==", "member").where("readByAdmin", "==", false).count().get();
  return snap.data().count;
}

export async function getMemberUnreadCount(memberId: string) {
  const threadsSnap = await threadsCollection.where("memberId", "==", memberId).select().get();
  if (threadsSnap.empty) return 0;
  const counts = await Promise.all(threadsSnap.docs.map(async (threadDoc) => {
    const snap = await messagesCollection(threadDoc.id)
      .where("readByMember", "==", false)
      .where("senderType", "in", ["admin", "system"])
      .count()
      .get();
    return snap.data().count;
  }));
  return counts.reduce((sum, value) => sum + value, 0);
}

export async function sendBookingNotification({
  memberEmail,
  bookingId,
  subject,
  body,
}: {
  memberEmail: string;
  // TODO(booking-migration): bookingId still comes from the not-yet-migrated Postgres bookings
  // table (numeric serial id). Once bookings move to Firestore this should become a string.
  bookingId: number;
  subject: string;
  body: string;
}) {
  const memberSnap = await db.collection("members").where("email", "==", memberEmail.toLowerCase()).limit(1).get();
  if (memberSnap.empty) return null;
  const memberId = memberSnap.docs[0].id;

  const existingSnap = await threadsCollection.where("memberId", "==", memberId).where("bookingId", "==", bookingId).limit(1).get();
  const now = FieldValue.serverTimestamp();

  let threadRef: FirebaseFirestore.DocumentReference;
  if (existingSnap.empty) {
    threadRef = threadsCollection.doc();
    await threadRef.set({ memberId, bookingId, subject, category: "booking", status: "open", lastMessageAt: now, createdAt: now, updatedAt: now });
  } else {
    threadRef = existingSnap.docs[0].ref;
    await threadRef.update({ subject, status: "open", lastMessageAt: now, updatedAt: now });
  }

  const messageRef = messagesCollection(threadRef.id).doc();
  await messageRef.set({
    senderType: "system",
    senderName: "Jyotish Studio",
    body: body.trim().slice(0, 3000),
    readByAdmin: true,
    readByMember: false,
    createdAt: now,
  });
  const messageSnap = await messageRef.get();
  return toMessage(threadRef.id, messageSnap);
}
