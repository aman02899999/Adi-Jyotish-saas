import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { ChatSessionNotFoundError, getSessionOr404, listSessionMessages } from "@/lib/chat";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid session id." }, { status: 400 });

  const [member, admin] = await Promise.all([getCurrentMember(), getCurrentAdmin()]);
  const isAdmin = Boolean(admin && hasAdminPermission(admin, "messages"));
  if (!member && !isAdmin) return Response.json({ error: "Sign-in required." }, { status: 401 });

  try {
    const session = await getSessionOr404(id);
    if (!isAdmin && (!member || session.memberId !== member.id)) return Response.json({ error: "You do not have access to this chat." }, { status: 403 });

    const [practitioner] = await db.select().from(practitioners).where(eq(practitioners.id, session.practitionerId)).limit(1);
    const messages = await listSessionMessages(id);
    return Response.json({ session, practitioner: practitioner ? { name: practitioner.name, photoUrl: practitioner.photoUrl } : null, messages });
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
