import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { publishChatEvent } from "@/lib/ably";

const MAX_HOLD_MINUTES = 30;
const MIN_HOLD_MINUTES = 1;

export class InsufficientBalanceError extends Error {}
export class PractitionerUnavailableError extends Error {}
export class ChatSessionConflictError extends Error {}
export class ChatSessionNotFoundError extends Error {}
export class ChatSessionEndedError extends Error {}

export type ChatSession = {
  id: string;
  memberId: string;
  practitionerId: string;
  walletHoldId: string;
  ratePerMinute: number;
  status: string;
  capturedAmount: number | null;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  senderType: string;
  senderName: string;
  body: string;
  createdAt: Date;
};

type ChatSessionDoc = {
  memberId: string;
  practitionerId: string;
  walletHoldId: string;
  ratePerMinute: number;
  status: string;
  capturedAmount: number | null;
  startedAt: FirebaseFirestore.Timestamp;
  endedAt: FirebaseFirestore.Timestamp | null;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
};

type ChatMessageDoc = { senderType: string; senderName: string; body: string; createdAt: FirebaseFirestore.Timestamp };

const sessionsCollection = db.collection("chatSessions");
function messagesCollection(sessionId: string) {
  return sessionsCollection.doc(sessionId).collection("messages");
}

function toSession(doc: FirebaseFirestore.DocumentSnapshot): ChatSession {
  const data = doc.data() as ChatSessionDoc;
  return {
    id: doc.id,
    memberId: data.memberId,
    practitionerId: data.practitionerId,
    walletHoldId: data.walletHoldId,
    ratePerMinute: data.ratePerMinute,
    status: data.status,
    capturedAmount: data.capturedAmount ?? null,
    startedAt: data.startedAt?.toDate() ?? new Date(),
    endedAt: data.endedAt ? data.endedAt.toDate() : null,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

function toMessage(sessionId: string, doc: FirebaseFirestore.DocumentSnapshot): ChatMessage {
  const data = doc.data() as ChatMessageDoc;
  return { id: doc.id, sessionId, senderType: data.senderType, senderName: data.senderName, body: data.body, createdAt: data.createdAt?.toDate() ?? new Date() };
}

function elapsedMinutesSince(date: Date) {
  return Math.max(1, Math.ceil((Date.now() - date.getTime()) / 60000));
}

// --- Wallet integration -----------------------------------------------------------------------
// TODO(billing-wallet-migration): wallets/{memberId} and its holds subcollection are owned by the
// billing/wallet migration (src/lib/wallet.ts, still Postgres-backed at the time of this pass).
// The helpers below read/write that collection directly using the walletHolds field shape
// (amount, status) per the migration brief, without touching wallet balance debit/credit
// invariants (ledger entries, locking) — those stay wallet.ts's responsibility. Once wallet.ts
// moves to Firestore, this inline logic should be replaced with its shared helpers.

async function readWalletBalance(memberId: string): Promise<{ balance: number; currency: string }> {
  const snap = await db.collection("wallets").doc(memberId).get();
  const data = snap.data() as { balance?: number; currency?: string } | undefined;
  return { balance: data?.balance ?? 0, currency: data?.currency ?? "INR" };
}

async function createWalletHold(memberId: string, amount: number) {
  const ref = db.collection("wallets").doc(memberId).collection("holds").doc();
  await ref.set({ amount, status: "active", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { id: ref.id, amount, status: "active" as const };
}

async function getWalletHold(memberId: string, holdId: string) {
  const snap = await db.collection("wallets").doc(memberId).collection("holds").doc(holdId).get();
  if (!snap.exists) return null;
  const data = snap.data() as { amount: number; status: string };
  return { id: snap.id, amount: data.amount, status: data.status };
}

async function captureWalletHold(memberId: string, holdId: string, capturedAmount: number) {
  await db.collection("wallets").doc(memberId).collection("holds").doc(holdId)
    .set({ status: "captured", capturedAmount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

// TODO(billing-subscriptions-migration): member session discounts (src/lib/subscriptions.ts) are
// still Postgres-backed and keyed by numeric member ids, incompatible with the Firebase UID
// strings used everywhere post-migration. Discounting is skipped here until that migration lands.
async function getMemberDiscountPercent(_memberId: string): Promise<number> {
  return 0;
}

function applyDiscount(amount: number, discountPercent: number) {
  if (!discountPercent) return amount;
  return Math.max(0, Math.round((amount * (100 - discountPercent)) / 100));
}

// --- Sessions ----------------------------------------------------------------------------------

export async function getMemberActiveSession(memberId: string): Promise<ChatSession | null> {
  const snap = await sessionsCollection.where("memberId", "==", memberId).where("status", "==", "active").limit(1).get();
  return snap.empty ? null : toSession(snap.docs[0]);
}

export async function startChatSession(memberId: string, practitionerId: string) {
  const practitionerSnap = await db.collection("practitioners").doc(practitionerId).get();
  const practitioner = practitionerSnap.exists ? (practitionerSnap.data() as { name: string; active: boolean; online: boolean; chatRatePerMinute: number }) : null;
  if (!practitioner || !practitioner.active || !practitioner.online) {
    throw new PractitionerUnavailableError("This practitioner is not available for instant chat right now.");
  }

  const existing = await getMemberActiveSession(memberId);
  if (existing) throw new ChatSessionConflictError("You already have an active chat. Finish it before starting another.");

  const wallet = await readWalletBalance(memberId);
  const discountPercent = await getMemberDiscountPercent(memberId);
  const rate = Math.max(1, applyDiscount(practitioner.chatRatePerMinute, discountPercent));
  const affordableMinutes = Math.floor(wallet.balance / rate);
  if (affordableMinutes < MIN_HOLD_MINUTES) {
    throw new InsufficientBalanceError(`Add at least ${wallet.currency} ${rate} to your wallet to start this chat.`);
  }

  const holdMinutes = Math.min(MAX_HOLD_MINUTES, affordableMinutes);
  const hold = await createWalletHold(memberId, rate * holdMinutes);

  const now = FieldValue.serverTimestamp();
  const sessionRef = sessionsCollection.doc();
  await sessionRef.set({
    memberId,
    practitionerId,
    walletHoldId: hold.id,
    ratePerMinute: rate,
    status: "active",
    capturedAmount: null,
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  await messagesCollection(sessionRef.id).add({
    senderType: "system",
    senderName: "Jyotish Studio",
    body: `Chat started with ${practitioner.name}. Up to ${holdMinutes} minutes available at ${wallet.currency} ${rate}/min.`,
    createdAt: now,
  });

  const sessionSnap = await sessionRef.get();
  return { session: toSession(sessionSnap), holdMinutes, practitioner };
}

export async function getSessionOr404(sessionId: string): Promise<ChatSession> {
  const snap = await sessionsCollection.doc(sessionId).get();
  if (!snap.exists) throw new ChatSessionNotFoundError("Chat session not found.");
  return toSession(snap);
}

export async function listSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const snap = await messagesCollection(sessionId).orderBy("createdAt", "asc").get();
  return snap.docs.map((doc) => toMessage(sessionId, doc));
}

export async function sendMessage({ sessionId, senderType, senderName, body }: { sessionId: string; senderType: "member" | "practitioner"; senderName: string; body: string }) {
  const session = await getSessionOr404(sessionId);
  if (session.status !== "active") throw new ChatSessionEndedError("This chat has ended.");

  const hold = await getWalletHold(session.memberId, session.walletHoldId);
  const elapsed = elapsedMinutesSince(session.startedAt);
  if (hold && hold.status === "active" && elapsed * session.ratePerMinute > hold.amount) {
    await endChatSession(sessionId, "system");
    throw new ChatSessionEndedError("This chat ended because the wallet balance reserved for it ran out.");
  }

  const ref = await messagesCollection(sessionId).add({ senderType, senderName, body: body.slice(0, 2000), createdAt: FieldValue.serverTimestamp() });
  const snap = await ref.get();
  const message = toMessage(sessionId, snap);
  await publishChatEvent(sessionId, "message", message);
  return message;
}

export async function endChatSession(sessionId: string, endedBy: "member" | "practitioner" | "system") {
  const session = await getSessionOr404(sessionId);
  if (session.status !== "active") return session;

  const hold = await getWalletHold(session.memberId, session.walletHoldId);
  const elapsed = elapsedMinutesSince(session.startedAt);
  const capturedAmount = Math.min(elapsed * session.ratePerMinute, hold?.amount ?? elapsed * session.ratePerMinute);
  await captureWalletHold(session.memberId, session.walletHoldId, capturedAmount);

  await sessionsCollection.doc(sessionId).update({ status: "ended", endedAt: FieldValue.serverTimestamp(), capturedAmount, updatedAt: FieldValue.serverTimestamp() });
  await messagesCollection(sessionId).add({ senderType: "system", senderName: "Jyotish Studio", body: "Chat ended. Thank you for connecting with Jyotish Studio.", createdAt: FieldValue.serverTimestamp() });
  await publishChatEvent(sessionId, "session-ended", { endedBy });

  const updatedSnap = await sessionsCollection.doc(sessionId).get();
  return toSession(updatedSnap);
}

export async function listActiveSessionsForAdmin() {
  const snap = await sessionsCollection.where("status", "==", "active").orderBy("startedAt", "desc").get();
  const sessions = snap.docs.map(toSession);
  if (!sessions.length) return [];

  const memberIds = Array.from(new Set(sessions.map((session) => session.memberId)));
  const practitionerIds = Array.from(new Set(sessions.map((session) => session.practitionerId)));
  const [memberDocs, practitionerDocs] = await Promise.all([
    db.getAll(...memberIds.map((id) => db.collection("members").doc(id))),
    db.getAll(...practitionerIds.map((id) => db.collection("practitioners").doc(id))),
  ]);
  const memberById = new Map(memberDocs.map((doc) => [doc.id, doc.data() as { name?: string; email?: string } | undefined]));
  const practitionerById = new Map(practitionerDocs.map((doc) => [doc.id, doc.data() as { name?: string } | undefined]));

  return sessions.map((session) => ({
    ...session,
    memberName: memberById.get(session.memberId)?.name ?? "Member",
    memberEmail: memberById.get(session.memberId)?.email ?? "",
    practitionerName: practitionerById.get(session.practitionerId)?.name ?? "Practitioner",
  }));
}

export type ChatActor = { role: "member"; id: string } | { role: "practitioner"; name: string };

export function resolveChatActor(session: { memberId: string }, memberId: string | null, isAuthorizedAdmin: boolean, practitionerName: string): ChatActor | null {
  if (memberId && session.memberId === memberId) return { role: "member", id: memberId };
  if (isAuthorizedAdmin) return { role: "practitioner", name: practitionerName };
  return null;
}

export async function getSessionForAdmin(sessionId: string) {
  const session = await getSessionOr404(sessionId);
  const [memberDoc, practitionerDoc] = await Promise.all([
    db.collection("members").doc(session.memberId).get(),
    db.collection("practitioners").doc(session.practitionerId).get(),
  ]);
  const memberName = (memberDoc.data() as { name?: string } | undefined)?.name ?? "Member";
  const practitionerName = (practitionerDoc.data() as { name?: string } | undefined)?.name ?? "Practitioner";
  return { ...session, memberName, practitionerName };
}
