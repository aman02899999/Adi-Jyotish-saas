import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chatSessions } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { getCurrentMember } from "@/lib/member-auth";
import { getPusher } from "@/lib/pusher";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const pusher = getPusher();
  if (!pusher) return Response.json({ error: "Realtime is not configured." }, { status: 503 });

  const form = await request.formData();
  const socketId = String(form.get("socket_id") ?? "");
  const channelName = String(form.get("channel_name") ?? "");
  const match = /^private-chat-(\d+)$/.exec(channelName);
  if (!socketId || !match) return Response.json({ error: "Invalid channel request." }, { status: 400 });

  const sessionId = Number(match[1]);
  const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).limit(1);
  if (!session) return Response.json({ error: "Chat session not found." }, { status: 404 });

  const member = await getCurrentMember();
  if (member && session.memberId === member.id) {
    return Response.json(pusher.authorizeChannel(socketId, channelName));
  }

  const admin = await getCurrentAdmin();
  if (admin && hasAdminPermission(admin, "messages")) {
    return Response.json(pusher.authorizeChannel(socketId, channelName));
  }

  return Response.json({ error: "You do not have access to this chat." }, { status: 403 });
}
