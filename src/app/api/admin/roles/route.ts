import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { createRole, getAllRolesAdmin, RoleError } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "roles")) return Response.json({ error: "Owner access required." }, { status: 403 });
  return Response.json(await getAllRolesAdmin());
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "roles")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const body = (await request.json()) as { name?: string; slug?: string; permissions?: string[] };
  try {
    const created = await createRole({ name: body.name ?? "", slug: body.slug ?? "", permissions: body.permissions ?? [] }, admin.permissions);
    await recordAudit(admin, "admin_role.created", "admin_role", created.id, { name: created.name, permissions: created.permissions });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof RoleError ? error.message : "Role could not be created." }, { status: 400 });
  }
}
