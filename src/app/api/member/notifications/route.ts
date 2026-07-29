import { getCurrentMember } from "@/lib/member-auth";
import { getNotifications, getUnreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const [items, unreadCount] = await Promise.all([
    getNotifications("member", member.id),
    getUnreadCount("member", member.id),
  ]);
  return Response.json({ items, unreadCount });
}
