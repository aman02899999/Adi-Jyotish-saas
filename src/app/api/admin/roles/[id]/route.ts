import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { deleteRole, RoleError, updateRole } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

// The [id] segment is the role's slug (adminRoles' Firestore doc id).

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "roles")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const { id: slug } = await params;
  if (!slug) return Response.json({ error: "Invalid role id." }, { status: 400 });

  const body = (await request.json()) as { name?: string; permissions?: string[] };
  try {
    const updated = await updateRole(slug, { name: body.name, permissions: body.permissions }, admin.role, admin.permissions);
    await recordAudit(admin, "admin_role.updated", "admin_role", slug, { name: updated.name, permissions: updated.permissions });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof RoleError ? error.message : "Role could not be updated." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "roles")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const { id: slug } = await params;
  if (!slug) return Response.json({ error: "Invalid role id." }, { status: 400 });

  try {
    await deleteRole(slug);
    await recordAudit(admin, "admin_role.deleted", "admin_role", slug);
    return Response.json({ ok: true, id: slug });
  } catch (error) {
    return Response.json({ error: error instanceof RoleError ? error.message : "Role could not be deleted." }, { status: 400 });
  }
}
