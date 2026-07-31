import { getAuth } from "firebase-admin/auth";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, normalizeEmail, recordAudit } from "@/lib/admin-auth";
import { createAdminInvite, listPendingAdminInvites } from "@/lib/admin-invites";
import { roleSlugExists } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

type AdminUserDoc = { name: string; email: string; role: string; active: boolean; lastLoginAt?: FirebaseFirestore.Timestamp | null; createdAt?: FirebaseFirestore.Timestamp };

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "team")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const [usersSnap, invites] = await Promise.all([
    db.collection("adminUsers").get(),
    listPendingAdminInvites(),
  ]);
  const users = usersSnap.docs
    .map((doc) => {
      const data = doc.data() as AdminUserDoc;
      return { id: doc.id, name: data.name, email: data.email, role: data.role, active: data.active, lastLoginAt: data.lastLoginAt ? data.lastLoginAt.toDate() : null, createdAt: data.createdAt ? data.createdAt.toDate() : new Date() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({ users, invites: invites.map(({ id, email, role, expiresAt, createdAt }) => ({ id, email, role, expiresAt, createdAt })) });
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "team")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const body = await request.json() as { email?: string; role?: string };
  const email = normalizeEmail(body.email ?? "");
  const requestedRole = body.role ?? "";
  const role = requestedRole !== "owner" && await roleSlugExists(requestedRole) ? requestedRole : "support";
  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Enter a valid team email." }, { status: 400 });

  const existingSnap = await db.collection("adminUsers").where("email", "==", email).limit(1).get();
  if (!existingSnap.empty) return Response.json({ error: "This person already has an administrator account." }, { status: 409 });
  try {
    await getAuth().getUserByEmail(email);
    return Response.json({ error: "This person already has an administrator account." }, { status: 409 });
  } catch {
    // No existing Firebase Auth user for this email — safe to invite.
  }

  const invite = await createAdminInvite(email, role, admin.id);
  await recordAudit(admin, "team.invited", "administrator_invite", invite.id, { email, role });
  return Response.json({ id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt, createdAt: invite.createdAt, invitePath: `/admin/invite/${invite.token}` }, { status: 201 });
}
