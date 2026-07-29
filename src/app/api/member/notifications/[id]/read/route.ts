import { getCurrentMember } from "@/lib/member-auth";
import { markNotificationRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function PUT(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid notification id." }, { status: 400 });
  await markNotificationRead(id, "member", member.id);
  return Response.json({ ok: true });
}
