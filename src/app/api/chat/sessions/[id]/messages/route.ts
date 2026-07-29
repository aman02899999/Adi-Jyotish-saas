import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { ChatSessionEndedError, ChatSessionNotFoundError, getSessionOr404, sendMessage } from "@/lib/chat";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid session id." }, { status: 400 });

  const body = (await request.json()) as { body?: string };
  const text = body.body?.trim();
  if (!text || text.length > 2000) return Response.json({ error: "Enter a message up to 2000 characters." }, { status: 400 });

  const [member, admin] = await Promise.all([getCurrentMember(), getCurrentAdmin()]);
  const isAdmin = Boolean(admin && hasAdminPermission(admin, "messages"));
  if (!member && !isAdmin) return Response.json({ error: "Sign-in required." }, { status: 401 });

  try {
    const session = await getSessionOr404(id);
    if (member && session.memberId === member.id) {
      const message = await sendMessage({ sessionId: id, senderType: "member", senderName: member.name, body: text });
      return Response.json(message, { status: 201 });
    }
    if (isAdmin) {
      const [practitioner] = await db.select().from(practitioners).where(eq(practitioners.id, session.practitionerId)).limit(1);
      const message = await sendMessage({ sessionId: id, senderType: "practitioner", senderName: practitioner?.name ?? "Studio", body: text });
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
