import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { getNotifications, getUnreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** `?count=1` returns only the unread count: the bell polls that, and loads the list (up to 30
 * reads) only when it is opened. */
export async function GET(request: Request) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });
  if (new URL(request.url).searchParams.get("count") === "1") {
    return Response.json({ unreadCount: await getUnreadCount("practitioner", practitioner.id) });
  }
  const [items, unreadCount] = await Promise.all([
    getNotifications("practitioner", practitioner.id),
    getUnreadCount("practitioner", practitioner.id),
  ]);
  return Response.json({ items, unreadCount });
}
