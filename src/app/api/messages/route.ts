import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { getAdminInbox } from "@/lib/messaging";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
  const throttle = await checkRateLimit("admin-message-thread", `admin:${admin.id}`, 60, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);
  const body = await request.json() as { memberId?: string; subject?: string; message?: string; category?: string };
  const memberId = body.memberId?.trim();
  const subject = body.subject?.trim().slice(0, 160) ?? "";
  const messageBody = body.message?.trim().slice(0, 3000) ?? "";
  const category = ["support", "booking", "billing", "general"].includes(body.category ?? "") ? body.category! : "general";
  if (!memberId || !subject || !messageBody) return Response.json({ error: "Member, subject, and message are required." }, { status: 400 });
  const memberSnap = await db.collection("members").doc(memberId).get();
  if (!memberSnap.exists) return Response.json({ error: "Member not found." }, { status: 404 });
  const member = memberSnap.data() as { name: string; email: string };

  const now = FieldValue.serverTimestamp();
  const threadRef = db.collection("messageThreads").doc();
  await threadRef.set({ memberId, bookingId: null, subject, category, status: "open", lastMessageAt: now, createdAt: now, updatedAt: now });
  const messageRef = threadRef.collection("messages").doc();
  await messageRef.set({ senderType: "admin", senderName: admin.name, body: messageBody, readByAdmin: true, readByMember: false, createdAt: now });

  await recordAudit(admin, "message.thread_created", "message_thread", threadRef.id, { memberId, category });

  const [threadSnap, messageSnap] = await Promise.all([threadRef.get(), messageRef.get()]);
  const threadData = threadSnap.data() as { subject: string; category: string; status: string; lastMessageAt: FirebaseFirestore.Timestamp; createdAt: FirebaseFirestore.Timestamp; updatedAt: FirebaseFirestore.Timestamp };
  const messageData = messageSnap.data() as { senderType: string; senderName: string; body: string; readByMember: boolean; readByAdmin: boolean; createdAt: FirebaseFirestore.Timestamp };
  const created = {
    id: threadRef.id, memberId, bookingId: null, subject: threadData.subject, category: threadData.category, status: threadData.status,
    lastMessageAt: threadData.lastMessageAt.toDate(), createdAt: threadData.createdAt.toDate(), updatedAt: threadData.updatedAt.toDate(),
    memberName: member.name, memberEmail: member.email,
    messages: [{ id: messageRef.id, threadId: threadRef.id, senderType: messageData.senderType, senderName: messageData.senderName, body: messageData.body, readByMember: messageData.readByMember, readByAdmin: messageData.readByAdmin, createdAt: messageData.createdAt.toDate() }],
  };
  return Response.json(created, { status: 201 });
}
