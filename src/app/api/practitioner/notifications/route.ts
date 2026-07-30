import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { getNotifications, getUnreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });
  const [items, unreadCount] = await Promise.all([
    getNotifications("practitioner", practitioner.id),
    getUnreadCount("practitioner", practitioner.id),
  ]);
  return Response.json({ items, unreadCount });
}
