import { getAbly, chatChannelName } from "@/lib/ably";
import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { ChatSessionNotFoundError, getSessionOr404 } from "@/lib/chat";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ably = getAbly();
  if (!ably) return Response.json({ error: "Realtime is not configured." }, { status: 503 });

  const sessionId = Number(new URL(request.url).searchParams.get("sessionId"));
  if (!Number.isInteger(sessionId) || sessionId <= 0) return Response.json({ error: "Invalid session." }, { status: 400 });

  const [member, admin] = await Promise.all([getCurrentMember(), getCurrentAdmin()]);

  let session;
  try {
    session = await getSessionOr404(sessionId);
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }

  const isOwner = Boolean(member && session.memberId === member.id);
  const isAuthorizedAdmin = Boolean(admin && hasAdminPermission(admin, "messages"));
  if (!isOwner && !isAuthorizedAdmin) return Response.json({ error: "You do not have access to this chat." }, { status: 403 });

  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: isOwner ? `member-${member!.id}` : `admin-${admin!.id}`,
    capability: { [chatChannelName(sessionId)]: ["subscribe"] },
  });
  return Response.json(tokenRequest);
}
