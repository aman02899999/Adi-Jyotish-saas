import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { findPractitionerInviteByToken } from "@/lib/practitioner-invites";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const throttle = await checkRateLimit("practitioner-invite-accept", requestIp(request), 10, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

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
    // The account we just took over may have been self-registered by someone else before the real
    // practitioner accepted this invite (Firebase's email/password sign-up never verifies email
    // ownership) — any refresh/ID token that impostor already holds must be invalidated now, or
    // they'd keep minting valid sessions for this now-practitioner-linked account indefinitely,
    // password reset notwithstanding.
    await getAuth().revokeRefreshTokens(uid);
  } catch {
    const created = await getAuth().createUser({ email: practitioner.email, password, displayName: practitioner.name });
    uid = created.uid;
  }

  await practitionerRef.update({ firebaseUid: uid, lastLoginAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await invite.ref.update({ acceptedAt: FieldValue.serverTimestamp() });

  return Response.json({ ok: true, practitioner: { name: practitioner.name, email: practitioner.email } }, { status: 201 });
}
