import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { ChatSessionEndedError, ChatSessionNotFoundError, getSessionOr404, sendMessage } from "@/lib/chat";
import { getCurrentMember } from "@/lib/member-auth";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = (await request.json()) as { body?: string };
  const text = body.body?.trim();
  if (!text || text.length > 2000) return Response.json({ error: "Enter a message up to 2000 characters." }, { status: 400 });

  const [member, admin, practitioner] = await Promise.all([getCurrentMember(), getCurrentAdmin(), getCurrentPractitioner()]);
  const isAdmin = Boolean(admin && hasAdminPermission(admin, "messages"));
  if (!member && !isAdmin && !practitioner) return Response.json({ error: "Sign-in required." }, { status: 401 });

  // Generous enough for real typing-speed back-and-forth, tight enough to block a scripted flood.
  const throttleKey = member ? `member:${member.id}` : practitioner ? `practitioner:${practitioner.id}` : `admin:${admin!.id}`;
  const throttle = await checkRateLimit("chat-message", throttleKey, 60, 300);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  try {
    const session = await getSessionOr404(id);
    if (member && session.memberId === member.id) {
      const message = await sendMessage({ sessionId: id, senderType: "member", senderName: member.name, body: text });
      return Response.json(message, { status: 201 });
    }
    if (practitioner && session.practitionerId === practitioner.id) {
      const message = await sendMessage({ sessionId: id, senderType: "practitioner", senderName: practitioner.name, body: text });
      return Response.json(message, { status: 201 });
    }
    if (isAdmin) {
      const practitionerSnap = await db.collection("practitioners").doc(session.practitionerId).get();
      const practitionerName = practitionerSnap.exists ? (practitionerSnap.data() as { name?: string }).name : undefined;
      const message = await sendMessage({ sessionId: id, senderType: "practitioner", senderName: practitionerName ?? "Studio", body: text });
      return Response.json(message, { status: 201 });
    }
    return Response.json({ error: "You do not have access to this chat." }, { status: 403 });
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof ChatSessionEndedError) return Response.json({ error: error.message }, { status: 409 });
    console.error("Chat message could not be sent", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Message could not be sent." }, { status: 500 });
  }
}
