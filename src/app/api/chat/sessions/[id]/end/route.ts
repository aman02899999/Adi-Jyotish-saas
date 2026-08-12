import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { ChatSessionNotFoundError, endChatSession, getSessionOr404 } from "@/lib/chat";
import { getCurrentMember } from "@/lib/member-auth";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [member, admin, practitioner] = await Promise.all([getCurrentMember(), getCurrentAdmin(), getCurrentPractitioner()]);
  const isAdmin = Boolean(admin && hasAdminPermission(admin, "messages"));
  if (!member && !isAdmin && !practitioner) return Response.json({ error: "Sign-in required." }, { status: 401 });

  try {
    const session = await getSessionOr404(id);
    const isOwnerMember = Boolean(member && session.memberId === member.id);
    const isOwnerPractitioner = Boolean(practitioner && session.practitionerId === practitioner.id);
    if (!isOwnerMember && !isOwnerPractitioner && !isAdmin) return Response.json({ error: "You do not have access to this chat." }, { status: 403 });

    const updated = await endChatSession(id, isOwnerMember ? "member" : "practitioner");
    return Response.json(updated);
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
