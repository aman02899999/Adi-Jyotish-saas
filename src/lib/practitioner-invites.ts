import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import {
  deletePendingPractitionerInvitesInSupabase,
  findPractitionerInviteByTokenHashInSupabase,
  insertPractitionerInviteInSupabase,
  markPractitionerInviteAcceptedInSupabase,
} from "@/lib/practitioner-invites-supabase";
import { getInvitedPractitionerInSupabase } from "@/lib/practitioner-auth-supabase";

const INVITE_DAYS = 7;

type PractitionerInviteDoc = {
  practitionerSlug: string;
  tokenHash: string;
  invitedBy: string | null;
  expiresAt: FirebaseFirestore.Timestamp;
  acceptedAt: FirebaseFirestore.Timestamp | null;
  createdAt: FirebaseFirestore.Timestamp;
};

function tokenHashOf(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a one-time invite link for a practitioner (identified by their `practitioners/{slug}`
 * document id) to set a password and link their auth account. Any previous unaccepted
 * invite for the same practitioner is discarded first, mirroring the old unique-per-practitioner
 * invite behaviour. */
export async function createPractitionerInvite(practitionerSlug: string, invitedBy: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = tokenHashOf(token);
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  if (isSupabaseCutoverActive()) {
    await deletePendingPractitionerInvitesInSupabase(practitionerSlug);
    const practitioner = await getInvitedPractitionerInSupabase(practitionerSlug);
    if (!practitioner) throw new Error(`No practitioner record exists for ${practitionerSlug}.`);
    await insertPractitionerInviteInSupabase({
      id: randomUUID(),
      email: practitioner.email,
      practitionerSlug,
      invitedBy,
      tokenHash,
      expiresAt,
    });
    return token;
  }

  const collection = db.collection("practitionerInvites");
  const existing = await collection.where("practitionerSlug", "==", practitionerSlug).where("acceptedAt", "==", null).get();
  if (!existing.empty) {
    const batch = db.batch();
    for (const doc of existing.docs) batch.delete(doc.ref);
    await batch.commit();
  }

  await collection.add({
    practitionerSlug,
    tokenHash,
    invitedBy,
    expiresAt,
    acceptedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  } satisfies Omit<PractitionerInviteDoc, "expiresAt" | "createdAt" | "acceptedAt"> & { expiresAt: Date; acceptedAt: null; createdAt: FirebaseFirestore.FieldValue });

  return token;
}

/** Returns the live invitation, or null when it is missing, already accepted, or expired. */
export async function findPractitionerInviteByToken(token: string) {
  const tokenHash = tokenHashOf(token);

  if (isSupabaseCutoverActive()) {
    const invite = await findPractitionerInviteByTokenHashInSupabase(tokenHash);
    return invite ? { id: invite.id, practitionerSlug: invite.practitionerSlug } : null;
  }

  const snap = await db.collection("practitionerInvites")
    .where("tokenHash", "==", tokenHash)
    .where("acceptedAt", "==", null)
    .limit(1)
    .get();
  if (snap.empty) return null;

  const doc = snap.docs[0];
  const data = doc.data() as PractitionerInviteDoc;
  if (data.expiresAt.toDate().getTime() < Date.now()) return null;

  return { id: doc.id, practitionerSlug: data.practitionerSlug };
}

/** Records that an invitation was accepted. */
export async function markPractitionerInviteAccepted(id: string): Promise<boolean> {
  if (isSupabaseCutoverActive()) return markPractitionerInviteAcceptedInSupabase(id);
  await db.collection("practitionerInvites").doc(id).update({ acceptedAt: FieldValue.serverTimestamp() });
  return true;
}
