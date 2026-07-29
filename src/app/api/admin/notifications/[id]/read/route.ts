import { getCurrentAdmin } from "@/lib/admin-auth";
import { markNotificationRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function PUT(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid notification id." }, { status: 400 });
  await markNotificationRead(id, "admin", admin.id);
  return Response.json({ ok: true });
}
