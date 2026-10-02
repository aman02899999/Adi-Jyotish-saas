import { getCurrentMember } from "@/lib/member-auth";
import { getNotifications, getUnreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** `?count=1` returns only the unread count: the bell polls that, and loads the list (up to 30
 * reads) only when it is opened. */
export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  if (new URL(request.url).searchParams.get("count") === "1") {
    return Response.json({ unreadCount: await getUnreadCount("member", member.id) });
  }
  const [items, unreadCount] = await Promise.all([
    getNotifications("member", member.id),
    getUnreadCount("member", member.id),
  ]);
  return Response.json({ items, unreadCount });
}
