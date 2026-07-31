import { getAuth } from "firebase-admin/auth";
import { createAdminSession, getCurrentAdmin, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** Completes admin sign-in: the client already authenticated with Firebase Auth (email/password
 * or Google) and hands us the resulting ID token to verify and mint a session cookie. */
export async function POST(request: Request) {
  const body = await request.json() as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });

  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(body.idToken, true)).uid;
  } catch {
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  try {
    await createAdminSession(body.idToken);
  } catch {
    return Response.json({ error: "This account does not have administrator access." }, { status: 403 });
  }

  const admin = await getCurrentAdmin();
  if (!admin || admin.id !== uid) return Response.json({ error: "This account does not have administrator access." }, { status: 403 });

  await recordAudit(admin, "auth.login", "administrator", admin.id);
  return Response.json({ ok: true, admin });
}
