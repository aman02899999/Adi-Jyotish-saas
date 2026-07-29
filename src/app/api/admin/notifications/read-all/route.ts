import { getCurrentAdmin } from "@/lib/admin-auth";
import { markAllNotificationsRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function PUT() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  await markAllNotificationsRead("admin", admin.id);
  return Response.json({ ok: true });
}
