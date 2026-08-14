import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { publishChatEvent } from "@/lib/ably";
import { applyDiscount, getMemberDiscountPercent } from "@/lib/subscriptions";
import { reviewDiscountPercent } from "@/lib/practitioner-pricing";
import { captureHold as captureWalletHold, createHold as createWalletHold, getActiveHold as getWalletHold, getOrCreateWallet, InsufficientBalanceError as WalletInsufficientBalanceError, releaseHold as releaseWalletHold } from "@/lib/wallet";

const MAX_HOLD_MINUTES = 30;
const MIN_HOLD_MINUTES = 1;

function isAlreadyExists(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === 6);
}

export class InsufficientBalanceError extends Error {}
export class PractitionerUnavailableError extends Error {}
export class ChatSessionConflictError extends Error {}
export class ChatSessionNotFoundError extends Error {}
export class ChatSessionEndedError extends Error {}

/** When starting a chat fails because the requested practitioner is offline, this gives the
 * member somewhere to go next instead of a dead-end error — a lightweight "smart suggestion"
 * rather than full auto-routing, since silently starting a session with a different practitioner
 * the member didn't choose would be presumptuous. */
export async function getOnlinePractitionerAlternatives(excludePractitionerId: string, limit = 4) {
  const snap = await db.collection("practitioners").where("active", "==", true).where("online", "==", true).limit(limit + 1).get();
  return snap.docs
    .filter((doc) => doc.id !== excludePractitionerId)
    .filter((doc) => !(doc.data() as { isDemoAccount?: boolean }).isDemoAccount)
    .slice(0, limit)
    .map((doc) => {
      const data = doc.data() as { name: string; slug: string; title: string; chatRatePerMinute: number };
      return { id: doc.id, name: data.name, slug: data.slug, title: data.title, chatRatePerMinute: data.chatRatePerMinute };
    });
}

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
// Delegates the actual balance debit/credit to wallet.ts's transactional hold functions, which
// keep the wallets/{memberId}.balance field, the ledger entries, and the hold docs consistent.
// An earlier version of this file reimplemented holds locally (writing hold docs directly under
// wallets/{memberId}/holds without ever touching .balance) — that silently never charged members
// for instant chat at all. Route everything through wallet.ts instead of duplicating it.

// --- Sessions ----------------------------------------------------------------------------------

/** A session's wallet hold funds at most MAX_HOLD_MINUTES — past that it's exhausted regardless
 * of whether anyone sent another message. sendMessage() only notices and settles this lazily on
 * the *next* message, so a session nobody sends another message to (tab closed, practitioner side
 * goes silent) would otherwise sit "active" forever: the hold never captures or releases, and the
 * member can't start a new chat since getMemberActiveSession sees a phantom in-progress one. This
 * sweeps and settles anything past that window, called opportunistically from the two places a
 * stale session would actually be noticed (no scheduled job in this deployment). */
export async function expireStaleChatSessions() {
  const cutoff = new Date(Date.now() - MAX_HOLD_MINUTES * 60000);
  const snap = await sessionsCollection.where("status", "==", "active").where("startedAt", "<", cutoff).limit(25).get();
  for (const doc of snap.docs) {
    await endChatSession(doc.id, "system").catch((error) => {
      console.error(`Failed to expire stale chat session ${doc.id}`, error);
    });
  }
}

export async function getMemberActiveSession(memberId: string): Promise<ChatSession | null> {
  await expireStaleChatSessions().catch((error) => console.error("Stale chat session sweep failed", error));
  const snap = await sessionsCollection.where("memberId", "==", memberId).where("status", "==", "active").limit(1).get();
  return snap.empty ? null : toSession(snap.docs[0]);
}

export async function startChatSession(memberId: string, practitionerId: string) {
  const practitionerSnap = await db.collection("practitioners").doc(practitionerId).get();
  const practitioner = practitionerSnap.exists ? (practitionerSnap.data() as { name: string; active: boolean; online: boolean; chatRatePerMinute: number }) : null;
  if (!practitioner || !practitioner.active || !practitioner.online) {
    throw new PractitionerUnavailableError("This practitioner is not available for instant chat right now.");
  }

  await expireStaleChatSessions().catch((error) => console.error("Stale chat session sweep failed", error));
  // Doc id == memberId, so Firestore's own create-fails-if-exists guarantee is the lock — two
  // concurrent start-session calls (double-click, client retry, two tabs) can no longer both pass
  // an "is there an active session" query before either commits; only one claims the lock, and the
  // rest fail immediately here instead of each reserving their own wallet hold.
  const lockRef = db.collection("chatActiveLocks").doc(memberId);
  try {
    await lockRef.create({ claimedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    if (isAlreadyExists(error)) throw new ChatSessionConflictError("You already have an active chat. Finish it before starting another.");
    throw error;
  }

  let wallet;
  try {
    wallet = await getOrCreateWallet(memberId);
  } catch (error) {
    await lockRef.delete().catch(() => {});
    throw error;
  }
  // Mirrors the discounted price shown on the practitioner's marketplace card (see
  // getMarketplacePractitioners in marketplace.ts) — new/unreviewed practitioners are discounted
  // to encourage first bookings, and that discount stacks with the member's own plan discount.
  const reviewsAgg = await db.collection("practitionerReviews").where("practitionerId", "==", practitionerId).where("status", "==", "published").count().get();
  const reviewDiscount = reviewDiscountPercent(reviewsAgg.data().count);
  const baseRate = applyDiscount(practitioner.chatRatePerMinute, reviewDiscount);
  const discountPercent = await getMemberDiscountPercent(memberId);
  const rate = Math.max(1, applyDiscount(baseRate, discountPercent));
  const affordableMinutes = Math.floor(wallet.balance / rate);
  if (affordableMinutes < MIN_HOLD_MINUTES) {
    await lockRef.delete().catch(() => {});
    throw new InsufficientBalanceError(`Add at least ${wallet.currency} ${rate} to your wallet to start this chat.`);
  }

  const holdMinutes = Math.min(MAX_HOLD_MINUTES, affordableMinutes);
  let hold;
  try {
    hold = await createWalletHold({ memberId, amount: rate * holdMinutes, referenceType: "chat_session" });
  } catch (error) {
    await lockRef.delete().catch(() => {});
    if (error instanceof WalletInsufficientBalanceError) throw new InsufficientBalanceError(`Add at least ${wallet.currency} ${rate} to your wallet to start this chat.`);
    throw error;
  }

  const now = FieldValue.serverTimestamp();
  const sessionRef = sessionsCollection.doc();
  try {
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
  } catch (error) {
    // The hold already reserved real wallet balance — release it back rather than leaving funds
    // stuck against a session that was never created.
    await releaseWalletHold({ memberId, holdId: hold.id, referenceType: "chat_session" }).catch(() => {});
    await lockRef.delete().catch(() => {});
    throw error;
  }

  await messagesCollection(sessionRef.id).add({
    senderType: "system",
    senderName: "Adi Jyotish Guru",
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
  await captureWalletHold({ memberId: session.memberId, holdId: session.walletHoldId, capturedAmount, referenceType: "chat_session" });

  await sessionsCollection.doc(sessionId).update({ status: "ended", endedAt: FieldValue.serverTimestamp(), capturedAmount, updatedAt: FieldValue.serverTimestamp() });
  await messagesCollection(sessionId).add({ senderType: "system", senderName: "Adi Jyotish Guru", body: "Chat ended. Thank you for connecting with Adi Jyotish Guru.", createdAt: FieldValue.serverTimestamp() });
  await publishChatEvent(sessionId, "session-ended", { endedBy });
  await db.collection("chatActiveLocks").doc(session.memberId).delete().catch(() => {});

  const updatedSnap = await sessionsCollection.doc(sessionId).get();
  return toSession(updatedSnap);
}

export async function listActiveSessionsForAdmin() {
  await expireStaleChatSessions().catch((error) => console.error("Stale chat session sweep failed", error));
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

/** The practitioner-portal equivalent of getSessionForAdmin — same shape, but scoped to sessions
 * that actually belong to the calling practitioner (thrown as ChatSessionNotFoundError rather than
 * a 403, matching how every other practitioner-scoped lookup in this app avoids confirming a
 * session id exists to someone who doesn't own it). */
export async function getSessionForPractitioner(sessionId: string, practitionerId: string) {
  const session = await getSessionOr404(sessionId);
  if (session.practitionerId !== practitionerId) throw new ChatSessionNotFoundError("Chat session not found.");
  const memberDoc = await db.collection("members").doc(session.memberId).get();
  const memberName = (memberDoc.data() as { name?: string } | undefined)?.name ?? "Member";
  return { ...session, memberName };
}

export async function listSessionsForPractitioner(practitionerId: string) {
  await expireStaleChatSessions().catch((error) => console.error("Stale chat session sweep failed", error));
  const snap = await sessionsCollection.where("practitionerId", "==", practitionerId).orderBy("startedAt", "desc").limit(30).get();
  const sessions = snap.docs.map(toSession);
  if (!sessions.length) return [];

  const memberIds = Array.from(new Set(sessions.map((session) => session.memberId)));
  const memberDocs = await db.getAll(...memberIds.map((id) => db.collection("members").doc(id)));
  const memberById = new Map(memberDocs.map((doc) => [doc.id, doc.data() as { name?: string } | undefined]));

  return sessions.map((session) => ({ ...session, memberName: memberById.get(session.memberId)?.name ?? "Member" }));
}
