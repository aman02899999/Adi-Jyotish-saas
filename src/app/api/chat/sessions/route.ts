import { getCurrentMember } from "@/lib/member-auth";
import { ChatSessionConflictError, InsufficientBalanceError, PractitionerUnavailableError, startChatSession } from "@/lib/chat";
import { chatChannelName } from "@/lib/pusher";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Sign in to start an instant chat." }, { status: 401 });

  const body = (await request.json()) as { practitionerId?: number };
  const practitionerId = Number(body.practitionerId);
  if (!Number.isInteger(practitionerId) || practitionerId <= 0) return Response.json({ error: "Invalid practitioner." }, { status: 400 });

  try {
    const { session, holdMinutes, practitioner } = await startChatSession(member.id, practitionerId);
    return Response.json({ sessionId: session.id, channel: chatChannelName(session.id), holdMinutes, ratePerMinute: session.ratePerMinute, practitionerName: practitioner.name }, { status: 201 });
  } catch (error) {
    if (error instanceof PractitionerUnavailableError || error instanceof ChatSessionConflictError || error instanceof InsufficientBalanceError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("Chat session could not be started", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Chat could not be started." }, { status: 500 });
  }
}
