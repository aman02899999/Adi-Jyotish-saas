import { getCurrentMember } from "@/lib/member-auth";
import { markNotificationRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function PUT(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const { id } = await params;
  await markNotificationRead(id, "member", member.id);
  return Response.json({ ok: true });
}
