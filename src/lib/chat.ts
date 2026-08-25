import "server-only";

import { AggregateField, FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { publishChatEvent } from "@/lib/ably";
import { applyDiscount, getMemberDiscountPercent } from "@/lib/subscriptions";
import { reviewDiscountPercent } from "@/lib/practitioner-pricing";
import { getMarketplacePractitioners } from "@/lib/marketplace";
import { captureHold as captureWalletHold, createHold as createWalletHold, getActiveHold as getWalletHold, getOrCreateWallet, InsufficientBalanceError as WalletInsufficientBalanceError, releaseHold as releaseWalletHold } from "@/lib/wallet";
import { getPractitionerChatReply, isGeminiConfigured } from "@/lib/gemini";

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
 * the member didn't choose would be presumptuous. Looks up sessionPrice from the (already-cached)
 * marketplace list rather than recomputing it here, so the suggestion's price always matches
 * what's shown on that practitioner's own card. */
export async function getOnlinePractitionerAlternatives(excludePractitionerId: string, limit = 4) {
  const [snap, marketplace] = await Promise.all([
    db.collection("practitioners").where("active", "==", true).where("online", "==", true).limit(limit + 1).get(),
    getMarketplacePractitioners(),
  ]);
  const sessionPriceById = new Map(marketplace.map((person) => [person.id, person.sessionPrice]));
  return snap.docs
    .filter((doc) => doc.id !== excludePractitionerId)
    .filter((doc) => !(doc.data() as { isDemoAccount?: boolean }).isDemoAccount)
    .slice(0, limit)
    .map((doc) => {
      const data = doc.data() as { name: string; slug: string; title: string; chatRatePerMinute: number };
      return { id: doc.id, name: data.name, slug: data.slug, title: data.title, chatRatePerMinute: data.chatRatePerMinute, sessionPrice: sessionPriceById.get(doc.id) ?? null };
    });
}

export type ChatSession = {
  id: string;
  memberId: string;
  practitionerId: string;
  walletHoldId: string;
  /** "fixed" sessions (AI-powered practitioners) charge fixedPrice once regardless of duration;
   * "metered" sessions (the 2 real practitioners) keep the original per-minute ratePerMinute
   * billing. Older session docs written before this field existed have no pricingModel — treated
   * as "metered" everywhere below since that was the only model at the time. */
  pricingModel: "metered" | "fixed";
  ratePerMinute: number;
  fixedPrice: number | null;
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
  pricingModel?: "metered" | "fixed";
  ratePerMinute: number;
  fixedPrice?: number | null;
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
    pricingModel: data.pricingModel ?? "metered",
    ratePerMinute: data.ratePerMinute,
    fixedPrice: data.fixedPrice ?? null,
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
  const practitioner = practitionerSnap.exists
    ? (practitionerSnap.data() as { name: string; active: boolean; online: boolean; chatRatePerMinute: number; isAiPowered?: boolean })
    : null;
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

  // Everything from here on either holds the chatActiveLocks doc or (once createWalletHold below
  // succeeds) real wallet balance — a single try/catch around the whole span guarantees both get
  // released on any failure, instead of only the specific steps that previously bothered to. A
  // partial failure here used to leave the member's session-start silently 500 with the lock (and,
  // worse, an already-reserved hold) stuck — permanently blocking new chats until the 30-minute
  // stale-session sweep eventually caught it, capturing the AI-powered flat price for a session the
  // member never actually got to open.
  let hold: Awaited<ReturnType<typeof createWalletHold>> | null = null;
  let ratePerMinute = 0;
  let fixedPrice: number | null = null;
  let pricingModel: "metered" | "fixed" = "metered";
  let holdMinutes = 0;
  try {
    const discountPercent = await getMemberDiscountPercent(memberId);

    // AI-powered practitioners (see isAiPowered in scheduling.ts) charge one flat price per session
    // instead of metering by the minute — an instant Gemini reply doesn't consume the practitioner's
    // time the way a real person's does, so there's nothing for per-minute billing to protect. The
    // real practitioners (Jagmohan Shashtri Ji, Arun Dubey Ji) keep the original per-minute model.
    pricingModel = practitioner.isAiPowered ? "fixed" : "metered";

    let holdAmount: number;
    if (pricingModel === "fixed") {
      // Reads the price from the same cached list the practitioner's marketplace card renders
      // (see getOnlinePractitionerAlternatives above for the identical pattern) instead of
      // recomputing it here — computeTieredSessionPrices ranks a practitioner's price against the
      // whole AI-powered roster, so recomputing it from this one practitioner's data alone could
      // never reproduce the same number, and what's billed must exactly match what's shown.
      const basePrice = (await getMarketplacePractitioners()).find((p) => p.id === practitionerId)?.sessionPrice;
      if (basePrice == null) throw new PractitionerUnavailableError("This practitioner's pricing isn't set up yet — try again in a moment.");
      fixedPrice = Math.max(1, applyDiscount(basePrice, discountPercent));
      if (wallet.balance < fixedPrice) {
        throw new InsufficientBalanceError(`Add at least ${wallet.currency} ${fixedPrice} to your wallet to start this chat.`);
      }
      holdAmount = fixedPrice;
      // Not a per-minute allowance — just reuses the same safety-net window expireStaleChatSessions
      // already force-ends any active session past (see its comment above), so a fixed-price chat
      // still can't run forever even though its price no longer depends on how long it runs.
      holdMinutes = MAX_HOLD_MINUTES;
    } else {
      // Mirrors the discounted price shown on the practitioner's marketplace card (see
      // getMarketplacePractitioners in marketplace.ts) — new/unreviewed practitioners are discounted
      // to encourage first bookings, and that discount stacks with the member's own plan discount.
      const reviewCount = (await db.collection("practitionerReviews").where("practitionerId", "==", practitionerId).where("status", "==", "published")
        .aggregate({ count: AggregateField.count() }).get()).data().count;
      const reviewDiscount = reviewDiscountPercent(reviewCount);
      const baseRate = applyDiscount(practitioner.chatRatePerMinute, reviewDiscount);
      const rate = Math.max(1, applyDiscount(baseRate, discountPercent));
      const affordableMinutes = Math.floor(wallet.balance / rate);
      if (affordableMinutes < MIN_HOLD_MINUTES) {
        throw new InsufficientBalanceError(`Add at least ${wallet.currency} ${rate} to your wallet to start this chat.`);
      }
      ratePerMinute = rate;
      holdMinutes = Math.min(MAX_HOLD_MINUTES, affordableMinutes);
      holdAmount = rate * holdMinutes;
    }

    hold = await createWalletHold({ memberId, amount: holdAmount, referenceType: "chat_session" });

    const now = FieldValue.serverTimestamp();
    const sessionRef = sessionsCollection.doc();
    await sessionRef.set({
      memberId,
      practitionerId,
      walletHoldId: hold.id,
      pricingModel,
      ratePerMinute,
      fixedPrice,
      status: "active",
      capturedAmount: null,
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const startMessage = pricingModel === "fixed"
      ? `Chat started with ${practitioner.name}. Flat price ${wallet.currency} ${fixedPrice} for this session, however long it runs.`
      : `Chat started with ${practitioner.name}. Up to ${holdMinutes} minutes available at ${wallet.currency} ${ratePerMinute}/min.`;
    await messagesCollection(sessionRef.id).add({
      senderType: "system",
      senderName: "Adi Jyotish Guru",
      body: startMessage,
      createdAt: now,
    });

    const sessionSnap = await sessionRef.get();
    return { session: toSession(sessionSnap), holdMinutes, practitioner };
  } catch (error) {
    // The hold (if one was ever created) already reserved real wallet balance — release it back
    // rather than leaving funds stuck against a session that was never actually handed to the
    // member.
    if (hold) await releaseWalletHold({ memberId, holdId: hold.id, referenceType: "chat_session" }).catch(() => {});
    await lockRef.delete().catch(() => {});
    if (error instanceof WalletInsufficientBalanceError) {
      throw new InsufficientBalanceError(`Add at least ${wallet.currency} ${pricingModel === "fixed" ? fixedPrice : ratePerMinute} to your wallet to start this chat.`);
    }
    throw error;
  }
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

  // Fixed-price sessions hold the full price up front and never exhaust early — the hold-vs-elapsed
  // check below only applies to metered sessions, where the hold funds a bounded number of minutes.
  if (session.pricingModel === "metered") {
    const hold = await getWalletHold(session.memberId, session.walletHoldId);
    const elapsed = elapsedMinutesSince(session.startedAt);
    if (hold && hold.status === "active" && elapsed * session.ratePerMinute > hold.amount) {
      await endChatSession(sessionId, "system");
      throw new ChatSessionEndedError("This chat ended because the wallet balance reserved for it ran out.");
    }
  }

  const ref = await messagesCollection(sessionId).add({ senderType, senderName, body: body.slice(0, 2000), createdAt: FieldValue.serverTimestamp() });
  const snap = await ref.get();
  const message = toMessage(sessionId, snap);
  await publishChatEvent(sessionId, "message", message);

  // Only a member's message can trigger a reply — this is a direct Firestore+Ably write (matching
  // the system messages above), not a recursive sendMessage() call, so an AI reply can never itself
  // trigger another AI reply.
  if (senderType === "member") {
    await maybeSendAiChatReply(session).catch((error) => console.error(`AI chat reply failed for session ${sessionId}`, error));
  }

  return message;
}

/** Builds the persona this practitioner's Gemini replies stay in character as, reusing their own
 * marketplace profile fields (name/title/bio/specialties) instead of a hand-written prompt per
 * practitioner — there are 30+ AI-powered profiles (see REAL_PRACTITIONER_SLUGS in scheduling.ts),
 * too many to maintain individually the way the 6 named reading personas in gemini.ts are. */
function buildPractitionerSystemPrompt(practitioner: { name: string; title: string; bio: string; specialties: string }) {
  return `Aap ${practitioner.name} hain — ${practitioner.title}, ek premium Jyotish studio ke liye kaam karte hain. Aapki specialties: ${practitioner.specialties}. Aapke baare mein: ${practitioner.bio}

Aap is samay ek client ke saath instant live chat mein hain (paid Vedic astrology consultation, ek flat session price par). Aapka jawaab HINGLISH mein hona chahiye (Hindi-English mila hua, Roman script mein, jaise log WhatsApp par likhte hain) — garmjoshi aur ek asli anubhavi jyotishi ki tarah baat karein. Chhote, natural chat messages mein jawaab dein (1-4 vaakya har baar) — poora likhit report ya lambा essay kabhi na dein, yeh ek live baatcheet hai. Client ke sawaal ka seedha jawaab dein; agar unhone abhi tak apni janm tithi, samay, ya sthan nahi bataya aur woh zaroori ho to unse poochh lein.

Kabhi bhi medical, legal, ya financial guarantee na dein, aur kabhi yeh dawa na karein ki yeh vigyanik roop se saabit hai — yeh ek paramparik Jyotish vidya hai, ise usi imaandaari se present karein. Hamesha client ke message ka ek grounded, sahayak jawaab dein — kabhi khaali ya "main nahi jaanta" jaisa jawaab na dein.`;
}

const AI_CHAT_REPLY_HISTORY_LIMIT = 12;

async function maybeSendAiChatReply(session: ChatSession) {
  const practitionerSnap = await db.collection("practitioners").doc(session.practitionerId).get();
  if (!practitionerSnap.exists) return;
  const practitioner = practitionerSnap.data() as { name: string; title: string; bio: string; specialties: string; isAiPowered?: boolean };
  if (!practitioner.isAiPowered || !isGeminiConfigured()) return;

  const memberSnap = await db.collection("members").doc(session.memberId).get();
  const memberName = (memberSnap.data() as { name?: string } | undefined)?.name ?? "Client";

  const history = await listSessionMessages(session.id);
  const turns = history.filter((m) => m.senderType === "member" || m.senderType === "practitioner").slice(-AI_CHAT_REPLY_HISTORY_LIMIT);
  const transcript = turns.map((m) => `${m.senderType === "member" ? memberName : practitioner.name}: ${m.body}`).join("\n");

  let reply: string;
  try {
    reply = await getPractitionerChatReply({ systemPrompt: buildPractitionerSystemPrompt(practitioner), transcript });
  } catch (error) {
    console.error(`Gemini chat reply generation failed for session ${session.id}`, error);
    return;
  }

  // The Gemini round-trip above can take long enough for the member (or the stale-session sweep)
  // to end the chat in the meantime — re-check before posting, or a bot reply (and Ably publish)
  // can land after the session's own "ended" system message, into a channel the client already
  // tore down.
  const freshStatus = await sessionsCollection.doc(session.id).get();
  if ((freshStatus.data() as { status?: string } | undefined)?.status !== "active") return;

  const ref = await messagesCollection(session.id).add({ senderType: "practitioner", senderName: practitioner.name, body: reply.slice(0, 2000), createdAt: FieldValue.serverTimestamp() });
  const snap = await ref.get();
  await publishChatEvent(session.id, "message", toMessage(session.id, snap));
}

export async function endChatSession(sessionId: string, endedBy: "member" | "practitioner" | "system") {
  const session = await getSessionOr404(sessionId);
  if (session.status !== "active") return session;

  const hold = await getWalletHold(session.memberId, session.walletHoldId);
  // Fixed-price sessions always capture the full held amount — the price was set once at session
  // start and doesn't prorate by how long the chat actually ran. Metered sessions still capture
  // only what elapsed time actually earned, capped at what the hold reserved.
  const capturedAmount = session.pricingModel === "fixed"
    ? (hold?.amount ?? session.fixedPrice ?? 0)
    : Math.min(elapsedMinutesSince(session.startedAt) * session.ratePerMinute, hold?.amount ?? elapsedMinutesSince(session.startedAt) * session.ratePerMinute);
  await captureWalletHold({ memberId: session.memberId, holdId: session.walletHoldId, capturedAmount, referenceType: "chat_session" });

  await sessionsCollection.doc(sessionId).update({ status: "ended", endedAt: FieldValue.serverTimestamp(), capturedAmount, updatedAt: FieldValue.serverTimestamp() });

  // Funds are already settled and the session is already marked ended at this point — none of these
  // three cleanup steps should be able to leave the member's chatActiveLocks doc stuck (e.g. an Ably
  // outage previously left the lock stuck against a session that had actually ended correctly, since
  // an unguarded throw here skipped the lock-delete below entirely), so each is independently
  // best-effort instead of one unguarded chain.
  await messagesCollection(sessionId).add({ senderType: "system", senderName: "Adi Jyotish Guru", body: "Chat ended. Thank you for connecting with Adi Jyotish Guru.", createdAt: FieldValue.serverTimestamp() })
    .catch((error) => console.error(`Failed to post chat-ended system message for session ${sessionId}`, error));
  await publishChatEvent(sessionId, "session-ended", { endedBy }).catch((error) => console.error(`Failed to publish session-ended event for session ${sessionId}`, error));
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
