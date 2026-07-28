import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers, messageThreads, threadMessages } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { getAdminInbox } from "@/lib/messaging";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "messages")) return Response.json({ error: "Message permission required." }, { status: 403 });
  return Response.json(await getAdminInbox());
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "messages")) return Response.json({ error: "Message permission required." }, { status: 403 });
  const body = await request.json() as { memberId?: number; subject?: string; message?: string; category?: string };
  const memberId = Number(body.memberId);
  const subject = body.subject?.trim().slice(0, 160) ?? "";
  const messageBody = body.message?.trim().slice(0, 3000) ?? "";
  const category = ["support", "booking", "billing", "general"].includes(body.category ?? "") ? body.category! : "general";
  if (!Number.isInteger(memberId) || !subject || !messageBody) return Response.json({ error: "Member, subject, and message are required." }, { status: 400 });
  const [member] = await db.select({ id: memberUsers.id, name: memberUsers.name, email: memberUsers.email }).from(memberUsers).where(eq(memberUsers.id, memberId)).limit(1);
  if (!member) return Response.json({ error: "Member not found." }, { status: 404 });

  const now = new Date();
  const created = await db.transaction(async (tx) => {
    const [thread] = await tx.insert(messageThreads).values({ memberId, subject, category, status: "open", lastMessageAt: now }).returning();
    const [message] = await tx.insert(threadMessages).values({ threadId: thread.id, senderType: "admin", senderName: admin.name, body: messageBody, readByAdmin: true, readByMember: false }).returning();
    return { ...thread, memberName: member.name, memberEmail: member.email, messages: [message] };
  });
  await recordAudit(admin, "message.thread_created", "message_thread", created.id, { memberId, category });
  return Response.json(created, { status: 201 });
}
