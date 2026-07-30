import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { deleteRole, RoleError, updateRole } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "roles")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid role id." }, { status: 400 });

  const body = (await request.json()) as { name?: string; permissions?: string[] };
  try {
    const updated = await updateRole(id, { name: body.name, permissions: body.permissions });
    await recordAudit(admin, "admin_role.updated", "admin_role", id, { name: updated.name, permissions: updated.permissions });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof RoleError ? error.message : "Role could not be updated." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "roles")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid role id." }, { status: 400 });

  try {
    await deleteRole(id);
    await recordAudit(admin, "admin_role.deleted", "admin_role", id);
    return Response.json({ ok: true, id });
  } catch (error) {
    return Response.json({ error: error instanceof RoleError ? error.message : "Role could not be deleted." }, { status: 400 });
  }
}
