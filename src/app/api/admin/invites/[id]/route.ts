import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "team")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const { id } = await params;
  const ref = db.collection("adminInvites").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Invitation not found." }, { status: 404 });

  const email = (snap.data() as { email: string }).email;
  await ref.delete();
  await recordAudit(admin, "team.invite_cancelled", "administrator_invite", id, { email });
  return Response.json({ ok: true, id });
}
