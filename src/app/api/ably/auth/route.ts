import { getAbly, chatChannelName } from "@/lib/ably";
import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { ChatSessionNotFoundError, getSessionOr404 } from "@/lib/chat";
import { getCurrentMember } from "@/lib/member-auth";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ably = getAbly();
  if (!ably) return Response.json({ error: "Realtime is not configured." }, { status: 503 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return Response.json({ error: "Invalid session." }, { status: 400 });

  // Previously only checked member/admin, so every practitioner's realtime auth request 403'd and
  // the chat UI silently fell back to 4-second polling — members got instant messages,
  // practitioners never did. The messages/end routes for this same chat already recognize
  // getCurrentPractitioner() as a valid actor; this was the one spot that didn't.
  const [member, admin, practitioner] = await Promise.all([getCurrentMember(), getCurrentAdmin(), getCurrentPractitioner()]);

  let session;
  try {
    session = await getSessionOr404(sessionId);
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }

  const isOwner = Boolean(member && session.memberId === member.id);
  const isSessionPractitioner = Boolean(practitioner && session.practitionerId === practitioner.id);
  const isAuthorizedAdmin = Boolean(admin && hasAdminPermission(admin, "messages"));
  if (!isOwner && !isSessionPractitioner && !isAuthorizedAdmin) return Response.json({ error: "You do not have access to this chat." }, { status: 403 });

  const clientId = isOwner ? `member-${member!.id}` : isSessionPractitioner ? `practitioner-${practitioner!.id}` : `admin-${admin!.id}`;
  const tokenRequest = await ably.auth.createTokenRequest({
    clientId,
    capability: { [chatChannelName(sessionId)]: ["subscribe"] },
  });
  return Response.json(tokenRequest);
}
