import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { ChatSessionNotFoundError, getSessionOr404, listSessionMessages } from "@/lib/chat";
import { getCurrentMember } from "@/lib/member-auth";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [member, admin, practitioner] = await Promise.all([getCurrentMember(), getCurrentAdmin(), getCurrentPractitioner()]);
  const isAdmin = Boolean(admin && hasAdminPermission(admin, "messages"));
  if (!member && !isAdmin && !practitioner) return Response.json({ error: "Sign-in required." }, { status: 401 });

  try {
    const session = await getSessionOr404(id);
    const isOwnerMember = Boolean(member && session.memberId === member.id);
    const isOwnerPractitioner = Boolean(practitioner && session.practitionerId === practitioner.id);
    if (!isAdmin && !isOwnerMember && !isOwnerPractitioner) return Response.json({ error: "You do not have access to this chat." }, { status: 403 });

    const practitionerSnap = await db.collection("practitioners").doc(session.practitionerId).get();
    const practitionerData = practitionerSnap.exists ? (practitionerSnap.data() as { name: string; photoUrl: string | null }) : null;
    const messages = await listSessionMessages(id);
    return Response.json({ session, practitioner: practitionerData ? { name: practitionerData.name, photoUrl: practitionerData.photoUrl } : null, messages });
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
