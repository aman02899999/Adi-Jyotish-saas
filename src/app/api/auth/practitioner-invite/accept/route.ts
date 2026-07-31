import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { findPractitionerInviteByToken } from "@/lib/practitioner-invites";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { token?: string; password?: string };
  const token = body.token ?? "";
  const password = body.password ?? "";
  if (!token || password.length < 10 || password.length > 128) {
    return Response.json({ error: "Use a password of at least 10 characters." }, { status: 400 });
  }

  const invite = await findPractitionerInviteByToken(token);
  if (!invite) return Response.json({ error: "This invitation is invalid or has expired." }, { status: 410 });

  const practitionerRef = db.collection("practitioners").doc(invite.practitionerSlug);
  const practitionerSnap = await practitionerRef.get();
  if (!practitionerSnap.exists) return Response.json({ error: "This invitation is invalid or has expired." }, { status: 410 });
  const practitioner = practitionerSnap.data() as { name: string; email: string; firebaseUid: string | null };

  let uid: string;
  try {
    const existingUser = await getAuth().getUserByEmail(practitioner.email);
    uid = existingUser.uid;
    await getAuth().updateUser(uid, { password });
  } catch {
    const created = await getAuth().createUser({ email: practitioner.email, password, displayName: practitioner.name });
    uid = created.uid;
  }

  await practitionerRef.update({ firebaseUid: uid, lastLoginAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await invite.ref.update({ acceptedAt: FieldValue.serverTimestamp() });

  return Response.json({ ok: true, practitioner: { name: practitioner.name, email: practitioner.email } }, { status: 201 });
}
