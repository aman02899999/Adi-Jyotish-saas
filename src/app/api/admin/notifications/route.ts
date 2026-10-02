import { getCurrentAdmin } from "@/lib/admin-auth";
import { getNotifications, getUnreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** `?count=1` returns only the unread count: the bell polls that, and loads the list (up to 30
 * reads) only when it is opened. */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (new URL(request.url).searchParams.get("count") === "1") {
    return Response.json({ unreadCount: await getUnreadCount("admin", admin.id) });
  }
  const [items, unreadCount] = await Promise.all([
    getNotifications("admin", admin.id),
    getUnreadCount("admin", admin.id),
  ]);
  return Response.json({ items, unreadCount });
}
