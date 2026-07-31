import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

type RecipientType = "member" | "admin" | "practitioner";

type NotificationDoc = {
  recipientType: RecipientType;
  recipientId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: FirebaseFirestore.Timestamp | null;
  createdAt: FirebaseFirestore.Timestamp;
};

function toNotification(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data() as NotificationDoc;
  return {
    id: doc.id,
    recipientType: data.recipientType,
    recipientId: data.recipientId,
    type: data.type,
    title: data.title,
    body: data.body,
    link: data.link,
    readAt: data.readAt ? data.readAt.toDate() : null,
    createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
  };
}

export async function createNotification(input: { recipientType: RecipientType; recipientId: string; type: string; title: string; body?: string; link?: string }) {
  await db.collection("notifications").add({
    recipientType: input.recipientType,
    recipientId: input.recipientId,
    type: input.type.slice(0, 60),
    title: input.title.slice(0, 160),
    body: input.body?.slice(0, 2000) ?? null,
    link: input.link?.slice(0, 300) ?? null,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Fan-out helper for notifying every active admin who holds a given permission (e.g. all owners/managers about a new order). */
export async function notifyAdmins(adminIds: string[], input: { type: string; title: string; body?: string; link?: string }) {
  if (!adminIds.length) return;
  const batch = db.batch();
  const collection = db.collection("notifications");
  for (const recipientId of adminIds) {
    batch.set(collection.doc(), {
      recipientType: "admin" as const,
      recipientId,
      type: input.type.slice(0, 60),
      title: input.title.slice(0, 160),
      body: input.body?.slice(0, 2000) ?? null,
      link: input.link?.slice(0, 300) ?? null,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function getNotifications(recipientType: RecipientType, recipientId: string, limit = 30) {
  const snap = await db.collection("notifications")
    .where("recipientType", "==", recipientType)
    .where("recipientId", "==", recipientId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map(toNotification);
}

export async function getUnreadCount(recipientType: RecipientType, recipientId: string) {
  const snap = await db.collection("notifications")
    .where("recipientType", "==", recipientType)
    .where("recipientId", "==", recipientId)
    .where("readAt", "==", null)
    .count()
    .get();
  return snap.data().count;
}

export async function markNotificationRead(id: string, recipientType: RecipientType, recipientId: string) {
  const ref = db.collection("notifications").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as NotificationDoc;
  if (data.recipientType !== recipientType || data.recipientId !== recipientId) return;
  await ref.update({ readAt: FieldValue.serverTimestamp() });
}

export async function markAllNotificationsRead(recipientType: RecipientType, recipientId: string) {
  const snap = await db.collection("notifications")
    .where("recipientType", "==", recipientType)
    .where("recipientId", "==", recipientId)
    .where("readAt", "==", null)
    .get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const doc of snap.docs) batch.update(doc.ref, { readAt: FieldValue.serverTimestamp() });
  await batch.commit();
}
