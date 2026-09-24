import { getAuth } from "firebase-admin/auth";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { roleSlugExists } from "@/lib/admin-roles";
import {
  countActiveOwnersInSupabase,
  deleteAdminUserInSupabase,
  getAdminUserInSupabase,
  updateAdminUserInSupabase,
  type AdminUserRow,
} from "@/lib/admin-team-supabase";
import { deleteGoTrueUser } from "@/lib/gotrue-admin";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { revokeAllUserSessions } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

type AdminUserDoc = { name: string; email: string; role: string; active: boolean; lastLoginAt?: FirebaseFirestore.Timestamp | null; createdAt?: FirebaseFirestore.Timestamp };

async function ownerCount() {
  if (isSupabaseCutoverActive()) return countActiveOwnersInSupabase();
  const snap = await db.collection("adminUsers").where("role", "==", "owner").where("active", "==", true).count().get();
  return snap.data().count;
}

async function loadAdmin(id: string): Promise<AdminUserRow | null> {
  if (isSupabaseCutoverActive()) return getAdminUserInSupabase(id);
  const snap = await db.collection("adminUsers").doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as AdminUserDoc;
  return {
    id: snap.id,
    name: data.name,
    email: data.email,
    role: data.role,
    active: data.active,
    lastLoginAt: data.lastLoginAt ? data.lastLoginAt.toDate() : null,
    createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
  };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "team")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const { id } = await params;
  const existing = await loadAdmin(id);
  if (!existing) return Response.json({ error: "Administrator not found." }, { status: 404 });

  const body = await request.json() as { role?: string; active?: boolean };
  const role = body.role && await roleSlugExists(body.role) ? body.role : existing.role;
  const active = body.active ?? existing.active;

  if (id === admin.id && !active) return Response.json({ error: "You cannot deactivate your own account." }, { status: 409 });
  if (id === admin.id && role !== existing.role) return Response.json({ error: "You cannot change your own role." }, { status: 409 });
  // Matches the invite endpoint's rule (team/route.ts POST never accepts role:"owner") — without
  // this, a "team"-permission holder could invite a throwaway account as a low role, then use this
  // endpoint to promote it (or an existing colleague) straight to owner.
  if (role === "owner" && existing.role !== "owner" && admin.role !== "owner") {
    return Response.json({ error: "Only an existing owner can grant the owner role." }, { status: 403 });
  }
  if (existing.role === "owner" && (role !== "owner" || !active) && await ownerCount() <= 1) {
    return Response.json({ error: "The workspace must retain at least one active owner." }, { status: 409 });
  }

  if (isSupabaseCutoverActive()) {
    await updateAdminUserInSupabase(id, { role, active });
  } else {
    await db.collection("adminUsers").doc(id).update({ role, active, updatedAt: new Date() });
  }
  if (!active) {
    try { await revokeAllUserSessions(id); } catch { /* user may already be gone */ }
  }
  await recordAudit(admin, "team.updated", "administrator", id, { role, active });

  return Response.json({ id, name: existing.name, email: existing.email, role, active, lastLoginAt: existing.lastLoginAt, createdAt: existing.createdAt });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "team")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const { id } = await params;
  if (id === admin.id) return Response.json({ error: "You cannot delete your own account." }, { status: 409 });

  const existing = await loadAdmin(id);
  if (!existing) return Response.json({ error: "Administrator not found." }, { status: 404 });
  if (existing.role === "owner" && existing.active && await ownerCount() <= 1) {
    return Response.json({ error: "The workspace must retain an active owner." }, { status: 409 });
  }

  if (isSupabaseCutoverActive()) {
    await deleteAdminUserInSupabase(id);
  } else {
    await db.collection("adminUsers").doc(id).delete();
  }
  try {
    if (isSupabaseCutoverActive()) await deleteGoTrueUser(id);
    else await getAuth().deleteUser(id);
  } catch { /* the auth account may already be gone */ }
  await recordAudit(admin, "team.deleted", "administrator", id, { email: existing.email, role: existing.role });
  return Response.json({ ok: true, id });
}
