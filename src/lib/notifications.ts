import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import {
  createNotificationInSupabase,
  createNotificationsInSupabase,
  getNotificationsInSupabase,
  getUnreadCountInSupabase,
  markAllNotificationsReadInSupabase,
  markNotificationReadInSupabase,
  type NotificationInsert,
} from "@/lib/notifications-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

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

// Every current caller passes a hardcoded server-side path, but nothing enforced that — this is
// the same guard already applied to the promo banner's CTA link, applied here defensively so a
// future caller can't accidentally (or via unsanitized user input) turn this into a javascript:/
// data: URI rendered as a clickable <Link href> in notification-bell.tsx.
function sanitizeLink(link: string | undefined): string | null {
  if (!link) return null;
  if (link.startsWith("/") && !link.startsWith("//")) return link;
  try {
    return new URL(link).protocol === "https:" ? link : null;
  } catch {
    return null;
  }
}

/** Truncation and link sanitising happen here, above the provider branch, so a
 * caller cannot get different limits depending on which backend is live. */
function normalizeNotification(input: { recipientType: RecipientType; recipientId: string; type: string; title: string; body?: string; link?: string }): NotificationInsert {
  return {
    recipientType: input.recipientType,
    recipientId: input.recipientId,
    type: input.type.slice(0, 60),
    title: input.title.slice(0, 160),
    body: input.body?.slice(0, 2000) ?? null,
    link: sanitizeLink(input.link?.slice(0, 300)),
  };
}

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
  const normalized = normalizeNotification(input);
  if (isSupabaseCutoverActive()) {
    await createNotificationInSupabase(normalized);
    return;
  }

  await db.collection("notifications").add({
    ...normalized,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Fan-out helper for notifying every active admin who holds a given permission (e.g. all owners/managers about a new order). */
export async function notifyAdmins(adminIds: string[], input: { type: string; title: string; body?: string; link?: string }) {
  if (!adminIds.length) return;
  const normalized = normalizeNotification({ ...input, recipientType: "admin", recipientId: "" });

  if (isSupabaseCutoverActive()) {
    await createNotificationsInSupabase(adminIds, normalized);
    return;
  }

  const batch = db.batch();
  const collection = db.collection("notifications");
  for (const recipientId of adminIds) {
    batch.set(collection.doc(), {
      ...normalized,
      recipientId,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function getNotifications(recipientType: RecipientType, recipientId: string, limit = 30) {
  if (isSupabaseCutoverActive()) return getNotificationsInSupabase(recipientType, recipientId, limit);
  const snap = await db.collection("notifications")
    .where("recipientType", "==", recipientType)
    .where("recipientId", "==", recipientId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map(toNotification);
}

export async function getUnreadCount(recipientType: RecipientType, recipientId: string) {
  if (isSupabaseCutoverActive()) return getUnreadCountInSupabase(recipientType, recipientId);
  const snap = await db.collection("notifications")
    .where("recipientType", "==", recipientType)
    .where("recipientId", "==", recipientId)
    .where("readAt", "==", null)
    .count()
    .get();
  return snap.data().count;
}

export async function markNotificationRead(id: string, recipientType: RecipientType, recipientId: string) {
  if (isSupabaseCutoverActive()) {
    await markNotificationReadInSupabase(id, recipientType, recipientId);
    return;
  }
  const ref = db.collection("notifications").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as NotificationDoc;
  if (data.recipientType !== recipientType || data.recipientId !== recipientId) return;
  await ref.update({ readAt: FieldValue.serverTimestamp() });
}

export async function markAllNotificationsRead(recipientType: RecipientType, recipientId: string) {
  if (isSupabaseCutoverActive()) {
    await markAllNotificationsReadInSupabase(recipientType, recipientId);
    return;
  }
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
