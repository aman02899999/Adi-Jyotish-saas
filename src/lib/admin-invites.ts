import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

const INVITE_DAYS = 7;

export type AdminInvite = { id: string; email: string; role: string; invitedBy: string | null; expiresAt: Date; acceptedAt: Date | null; createdAt: Date };

type AdminInviteDoc = {
  email: string;
  role: string;
  tokenHash: string;
  invitedBy: string | null;
  expiresAt: FirebaseFirestore.Timestamp;
  acceptedAt: FirebaseFirestore.Timestamp | null;
  createdAt: FirebaseFirestore.Timestamp;
};

const collection = db.collection("adminInvites");

function toInvite(doc: FirebaseFirestore.QueryDocumentSnapshot): AdminInvite {
  const data = doc.data() as AdminInviteDoc;
  return { id: doc.id, email: data.email, role: data.role, invitedBy: data.invitedBy, expiresAt: data.expiresAt.toDate(), acceptedAt: data.acceptedAt ? data.acceptedAt.toDate() : null, createdAt: data.createdAt?.toDate() ?? new Date() };
}

export async function listPendingAdminInvites(): Promise<AdminInvite[]> {
  const snap = await collection.where("acceptedAt", "==", null).orderBy("createdAt", "asc").get();
  const now = Date.now();
  return snap.docs.map(toInvite).filter((invite) => invite.expiresAt.getTime() > now);
}

export async function createAdminInvite(email: string, role: string, invitedBy: string) {
  const existing = await collection.where("email", "==", email).get();
  if (!existing.empty) {
    const batch = db.batch();
    for (const doc of existing.docs) batch.delete(doc.ref);
    await batch.commit();
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  const ref = await collection.add({ email, role, tokenHash, invitedBy, expiresAt, acceptedAt: null, createdAt: FieldValue.serverTimestamp() });
  return { id: ref.id, email, role, expiresAt, createdAt: new Date(), token };
}

export async function findAdminInviteByToken(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const snap = await collection.where("tokenHash", "==", tokenHash).where("acceptedAt", "==", null).limit(1).get();
  if (snap.empty) return null;
  const invite = toInvite(snap.docs[0]);
  if (invite.expiresAt.getTime() < Date.now()) return null;
  return { ...invite, ref: snap.docs[0].ref };
}
