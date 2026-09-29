import { deleteAdminInviteById } from "@/lib/admin-directory";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "team")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const { id } = await params;
  const deleted = await deleteAdminInviteById(id);
  if (!deleted) return Response.json({ error: "Invitation not found." }, { status: 404 });
  const { email } = deleted;
  await recordAudit(admin, "team.invite_cancelled", "administrator_invite", id, { email });
  return Response.json({ ok: true, id });
}
