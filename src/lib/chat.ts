import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, chatSessions, memberUsers, practitioners } from "@/db/schema";
import { publishChatEvent } from "@/lib/pusher";
import { captureHold, createHold, getActiveHold, getOrCreateWallet, InsufficientBalanceError } from "@/lib/wallet";

export { InsufficientBalanceError };

const MAX_HOLD_MINUTES = 30;
const MIN_HOLD_MINUTES = 1;
const REFERENCE_TYPE = "chat_session";

export class PractitionerUnavailableError extends Error {}
export class ChatSessionConflictError extends Error {}
export class ChatSessionNotFoundError extends Error {}
export class ChatSessionEndedError extends Error {}

function elapsedMinutesSince(date: Date) {
  return Math.max(1, Math.ceil((Date.now() - date.getTime()) / 60000));
}

export async function getMemberActiveSession(memberId: number) {
  const [session] = await db.select().from(chatSessions).where(and(eq(chatSessions.memberId, memberId), eq(chatSessions.status, "active"))).limit(1);
  return session ?? null;
}

export async function startChatSession(memberId: number, practitionerId: number) {
  const [practitioner] = await db.select().from(practitioners).where(eq(practitioners.id, practitionerId)).limit(1);
  if (!practitioner || !practitioner.active || !practitioner.online) {
    throw new PractitionerUnavailableError("This practitioner is not available for instant chat right now.");
  }

  const existing = await getMemberActiveSession(memberId);
  if (existing) throw new ChatSessionConflictError("You already have an active chat. Finish it before starting another.");

  const wallet = await getOrCreateWallet(memberId);
  const rate = practitioner.chatRatePerMinute;
  const affordableMinutes = Math.floor(wallet.balance / rate);
  if (affordableMinutes < MIN_HOLD_MINUTES) {
    throw new InsufficientBalanceError(`Add at least ${wallet.currency} ${rate} to your wallet to start this chat.`);
  }

  const holdMinutes = Math.min(MAX_HOLD_MINUTES, affordableMinutes);
  const hold = await createHold({ memberId, amount: rate * holdMinutes, referenceType: REFERENCE_TYPE });

  const [session] = await db.insert(chatSessions).values({
    memberId,
    practitionerId,
    walletHoldId: hold.id,
    ratePerMinute: rate,
    status: "active",
  }).returning();

  await db.insert(chatMessages).values({ sessionId: session.id, senderType: "system", senderName: "Jyotish Studio", body: `Chat started with ${practitioner.name}. Up to ${holdMinutes} minutes available at ${wallet.currency} ${rate}/min.` });
  return { session, holdMinutes, practitioner };
}

export async function getSessionOr404(sessionId: number) {
  const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).limit(1);
  if (!session) throw new ChatSessionNotFoundError("Chat session not found.");
  return session;
}

export async function listSessionMessages(sessionId: number) {
  return db.select().from(chatMessages).where(eq(chatMessages.sessionId, sessionId)).orderBy(asc(chatMessages.createdAt));
}

export async function sendMessage({ sessionId, senderType, senderName, body }: { sessionId: number; senderType: "member" | "practitioner"; senderName: string; body: string }) {
  const session = await getSessionOr404(sessionId);
  if (session.status !== "active") throw new ChatSessionEndedError("This chat has ended.");

  const hold = await getActiveHold(session.walletHoldId);
  const elapsed = elapsedMinutesSince(session.startedAt);
  if (hold && hold.status === "active" && elapsed * session.ratePerMinute > hold.amount) {
    await endChatSession(sessionId, "system");
    throw new ChatSessionEndedError("This chat ended because the wallet balance reserved for it ran out.");
  }

  const [message] = await db.insert(chatMessages).values({ sessionId, senderType, senderName, body: body.slice(0, 2000) }).returning();
  await publishChatEvent(sessionId, "message", message);
  return message;
}

export async function endChatSession(sessionId: number, endedBy: "member" | "practitioner" | "system") {
  const session = await getSessionOr404(sessionId);
  if (session.status !== "active") return session;

  const hold = await getActiveHold(session.walletHoldId);
  const elapsed = elapsedMinutesSince(session.startedAt);
  const capturedAmount = Math.min(elapsed * session.ratePerMinute, hold?.amount ?? elapsed * session.ratePerMinute);
  await captureHold({ holdId: session.walletHoldId, capturedAmount, referenceType: REFERENCE_TYPE });

  const now = new Date();
  const [updated] = await db.update(chatSessions).set({ status: "ended", endedAt: now, capturedAmount, updatedAt: now }).where(eq(chatSessions.id, sessionId)).returning();
  await db.insert(chatMessages).values({ sessionId, senderType: "system", senderName: "Jyotish Studio", body: "Chat ended. Thank you for connecting with Jyotish Studio." });
  await publishChatEvent(sessionId, "session-ended", { endedBy });
  return updated;
}

export async function listActiveSessionsForAdmin() {
  const rows = await db.select({ session: chatSessions, memberName: memberUsers.name, memberEmail: memberUsers.email, practitionerName: practitioners.name })
    .from(chatSessions)
    .innerJoin(memberUsers, eq(chatSessions.memberId, memberUsers.id))
    .innerJoin(practitioners, eq(chatSessions.practitionerId, practitioners.id))
    .where(eq(chatSessions.status, "active"))
    .orderBy(desc(chatSessions.startedAt));
  return rows.map((row) => ({ ...row.session, memberName: row.memberName, memberEmail: row.memberEmail, practitionerName: row.practitionerName }));
}

export type ChatActor = { role: "member"; id: number } | { role: "practitioner"; name: string };

export function resolveChatActor(session: { memberId: number }, memberId: number | null, isAuthorizedAdmin: boolean, practitionerName: string): ChatActor | null {
  if (memberId && session.memberId === memberId) return { role: "member", id: memberId };
  if (isAuthorizedAdmin) return { role: "practitioner", name: practitionerName };
  return null;
}

export async function getSessionForAdmin(sessionId: number) {
  const [row] = await db.select({ session: chatSessions, memberName: memberUsers.name, practitionerName: practitioners.name })
    .from(chatSessions)
    .innerJoin(memberUsers, eq(chatSessions.memberId, memberUsers.id))
    .innerJoin(practitioners, eq(chatSessions.practitionerId, practitioners.id))
    .where(eq(chatSessions.id, sessionId))
    .limit(1);
  if (!row) throw new ChatSessionNotFoundError("Chat session not found.");
  return { ...row.session, memberName: row.memberName, practitionerName: row.practitionerName };
}
