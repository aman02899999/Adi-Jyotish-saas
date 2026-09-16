import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { recordAudit } from "@/lib/admin-auth";
import { createAdminInSupabase } from "@/lib/admin-auth-supabase";
import { findAdminInviteByToken, markAdminInviteAccepted } from "@/lib/admin-invites";
import { createGoTrueUser } from "@/lib/gotrue-admin";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { token?: string; name?: string; password?: string };
  const token = body.token ?? "";
  const name = body.name?.trim().slice(0, 120) ?? "";
  const password = body.password ?? "";
  if (!token || name.length < 2 || password.length < 10 || password.length > 128) {
    return Response.json({ error: "Complete your name and use a password of at least 10 characters." }, { status: 400 });
  }

  const invite = await findAdminInviteByToken(token);
  if (!invite) return Response.json({ error: "This invitation is invalid or has expired." }, { status: 410 });

  let uid: string;
  try {
    uid = isSupabaseCutoverActive()
      ? (await createGoTrueUser({ email: invite.email, password, name })).uid
      : (await getAuth().createUser({ email: invite.email, password, displayName: name })).uid;
  } catch {
    return Response.json({ error: "An account already exists for this email." }, { status: 409 });
  }

  if (isSupabaseCutoverActive()) {
    // No login stamp: the invitee has no session yet and has never signed in.
    await createAdminInSupabase({ id: uid, name, email: invite.email, role: invite.role, stampLogin: false });
  } else {
    await db.collection("adminUsers").doc(uid).set({
      name,
      email: invite.email,
      role: invite.role,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await markAdminInviteAccepted(invite.id);
  await recordAudit({ id: uid, name }, "team.invite_accepted", "administrator", uid, { role: invite.role });

  return Response.json({ ok: true, admin: { id: uid, name, email: invite.email, role: invite.role } }, { status: 201 });
}
