import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { findPractitionerInviteByToken, markPractitionerInviteAccepted } from "@/lib/practitioner-invites";
import { getInvitedPractitionerInSupabase, linkPractitionerUidInSupabase } from "@/lib/practitioner-auth-supabase";
import { createGoTrueUser, findGoTrueUserByEmail, updateGoTrueUserPassword } from "@/lib/gotrue-admin";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { revokeAllUserSessions } from "@/lib/session-cookie";

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

  let practitionerName: string;
  let practitionerEmail: string;
  if (isSupabaseCutoverActive()) {
    const practitioner = await getInvitedPractitionerInSupabase(invite.practitionerSlug);
    if (!practitioner) return Response.json({ error: "This invitation is invalid or has expired." }, { status: 410 });
    practitionerName = practitioner.name;
    practitionerEmail = practitioner.email;
  } else {
    const practitionerSnap = await db.collection("practitioners").doc(invite.practitionerSlug).get();
    if (!practitionerSnap.exists) return Response.json({ error: "This invitation is invalid or has expired." }, { status: 410 });
    const practitioner = practitionerSnap.data() as { name: string; email: string };
    practitionerName = practitioner.name;
    practitionerEmail = practitioner.email;
  }

  let uid: string;
  if (isSupabaseCutoverActive()) {
    const existing = await findGoTrueUserByEmail(practitionerEmail);
    if (existing) {
      uid = existing.uid;
      await updateGoTrueUserPassword(uid, password);
      // The account we just took over may have been self-registered by someone else before the
      // real practitioner accepted this invite — any token that impostor already holds must be
      // invalidated now, or they'd keep minting valid sessions for this now-linked account.
      await revokeAllUserSessions(uid);
    } else {
      uid = (await createGoTrueUser({ email: practitionerEmail, password, name: practitionerName })).uid;
    }
  } else {
    try {
      const existingUser = await getAuth().getUserByEmail(practitionerEmail);
      uid = existingUser.uid;
      await getAuth().updateUser(uid, { password });
      // The account we just took over may have been self-registered by someone else before the real
      // practitioner accepted this invite (Firebase's email/password sign-up never verifies email
      // ownership) — any refresh/ID token that impostor already holds must be invalidated now, or
      // they'd keep minting valid sessions for this now-practitioner-linked account indefinitely,
      // password reset notwithstanding.
      await revokeAllUserSessions(uid);
    } catch {
      const created = await getAuth().createUser({ email: practitionerEmail, password, displayName: practitionerName });
      uid = created.uid;
    }
  }

  if (isSupabaseCutoverActive()) {
    await linkPractitionerUidInSupabase(invite.practitionerSlug, uid);
  } else {
    await db.collection("practitioners").doc(invite.practitionerSlug).update({
      firebaseUid: uid,
      lastLoginAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await markPractitionerInviteAccepted(invite.id);

  return Response.json({ ok: true, practitioner: { name: practitionerName, email: practitionerEmail } }, { status: 201 });
}
