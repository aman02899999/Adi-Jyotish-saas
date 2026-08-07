import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { ALL_ADMIN_PERMISSIONS, createAdminSession, getAdminCount, getCurrentAdmin, normalizeEmail, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** First-run bootstrap: creates the workspace's owner admin from a Firebase ID token the client
 * obtained via createUserWithEmailAndPassword. Only allowed while no admin exists yet. */
export async function POST(request: Request) {
  if (await getAdminCount() > 0) {
    return Response.json({ error: "Administrator setup is already complete." }, { status: 403 });
  }

  const body = await request.json() as { idToken?: string; name?: string };
  const name = body.name?.trim().slice(0, 120) ?? "";
  if (name.length < 2) return Response.json({ error: "Enter your name." }, { status: 400 });
  if (!body.idToken) return Response.json({ error: "Sign-in could not be completed." }, { status: 400 });

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(body.idToken, true);
  } catch {
    return Response.json({ error: "Sign-in could not be completed." }, { status: 401 });
  }
  const email = normalizeEmail(decoded.email ?? "");
  if (!email) return Response.json({ error: "Your account has no verified email address." }, { status: 400 });

  await db.collection("adminRoles").doc("owner").set({
    name: "Owner",
    isSystem: true,
    permissions: ALL_ADMIN_PERMISSIONS.map((permission) => permission.key),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("adminUsers").doc(decoded.uid).set({
    name,
    email,
    role: "owner",
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  });

  await createAdminSession(body.idToken);
  const admin = await getCurrentAdmin();
  if (admin) await recordAudit(admin, "account.created", "administrator", admin.id, { role: admin.role });
  return Response.json({ ok: true, admin }, { status: 201 });
}
