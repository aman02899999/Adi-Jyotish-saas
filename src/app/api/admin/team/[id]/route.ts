import { getAuth } from "firebase-admin/auth";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { roleSlugExists } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

type AdminUserDoc = { name: string; email: string; role: string; active: boolean; lastLoginAt?: FirebaseFirestore.Timestamp | null; createdAt?: FirebaseFirestore.Timestamp };

async function ownerCount() {
  const snap = await db.collection("adminUsers").where("role", "==", "owner").where("active", "==", true).count().get();
  return snap.data().count;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "team")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const { id } = await params;
  const ref = db.collection("adminUsers").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Administrator not found." }, { status: 404 });
  const existing = snap.data() as AdminUserDoc;

  const body = await request.json() as { role?: string; active?: boolean };
  const role = body.role && await roleSlugExists(body.role) ? body.role : existing.role;
  const active = body.active ?? existing.active;

  if (id === admin.id && !active) return Response.json({ error: "You cannot deactivate your own account." }, { status: 409 });
  if (existing.role === "owner" && (role !== "owner" || !active) && await ownerCount() <= 1) {
    return Response.json({ error: "The workspace must retain at least one active owner." }, { status: 409 });
  }

  await ref.update({ role, active, updatedAt: new Date() });
  if (!active) {
    try { await getAuth().revokeRefreshTokens(id); } catch { /* user may already be gone */ }
  }
  await recordAudit(admin, "team.updated", "administrator", id, { role, active });

  const updated = { id, name: existing.name, email: existing.email, role, active, lastLoginAt: existing.lastLoginAt ? existing.lastLoginAt.toDate() : null, createdAt: existing.createdAt ? existing.createdAt.toDate() : new Date() };
  return Response.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "team")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const { id } = await params;
  if (id === admin.id) return Response.json({ error: "You cannot delete your own account." }, { status: 409 });

  const ref = db.collection("adminUsers").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Administrator not found." }, { status: 404 });
  const existing = snap.data() as AdminUserDoc;
  if (existing.role === "owner" && existing.active && await ownerCount() <= 1) {
    return Response.json({ error: "The workspace must retain an active owner." }, { status: 409 });
  }

  await ref.delete();
  try { await getAuth().deleteUser(id); } catch { /* Firebase Auth user may already be gone */ }
  await recordAudit(admin, "team.deleted", "administrator", id, { email: existing.email, role: existing.role });
  return Response.json({ ok: true, id });
}
