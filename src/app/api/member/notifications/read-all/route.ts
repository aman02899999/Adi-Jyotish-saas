import { getCurrentMember } from "@/lib/member-auth";
import { markAllNotificationsRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function PUT() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  await markAllNotificationsRead("member", member.id);
  return Response.json({ ok: true });
}
