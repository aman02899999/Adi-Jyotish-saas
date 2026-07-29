import { getCurrentAdmin } from "@/lib/admin-auth";
import { getNotifications, getUnreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  const [items, unreadCount] = await Promise.all([
    getNotifications("admin", admin.id),
    getUnreadCount("admin", admin.id),
  ]);
  return Response.json({ items, unreadCount });
}
