import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getOrCreateWallet } from "@/lib/wallet";

/** A gift card is wallet credit purchased for someone else — reusing the existing wallet ledger
 * rather than a parallel "gift a specific service" flow, since the recipient can then spend it on
 * whichever reading, chat, or gemstone they actually want. */

export class GiftCardError extends Error {}

export const GIFT_AMOUNTS = [500, 1000, 2000, 5000] as const;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids typos when read aloud

function generateCode(): string {
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `AJG-${suffix}`;
}

export type GiftCard = {
  code: string;
  buyerId: string;
  buyerName: string;
  amount: number;
  currency: string;
  recipientName: string;
  message: string;
  status: "unclaimed" | "claimed";
  redeemedBy: string | null;
};

type GiftCardDoc = Omit<GiftCard, "code">;

function giftCardFromSnap(snap: FirebaseFirestore.DocumentSnapshot): GiftCard {
  const data = snap.data() as GiftCardDoc;
  return { code: snap.id, ...data };
}

export async function createGiftCard({ buyerId, buyerName, amount, currency, recipientName, message, razorpayPaymentId }: {
  buyerId: string; buyerName: string; amount: number; currency: string; recipientName: string; message: string; razorpayPaymentId: string;
}): Promise<GiftCard> {
  const existing = await db.collection("giftCards").where("razorpayPaymentId", "==", razorpayPaymentId).limit(1).get();
  if (!existing.empty) return giftCardFromSnap(existing.docs[0]);

  let code = generateCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const codeSnap = await db.collection("giftCards").doc(code).get();
    if (!codeSnap.exists) break;
    code = generateCode();
  }

  const doc = {
    buyerId, buyerName, amount, currency,
    recipientName: recipientName.trim().slice(0, 120) || "a friend",
    message: message.trim().slice(0, 280),
    status: "unclaimed" as const,
    redeemedBy: null,
    razorpayPaymentId,
    createdAt: FieldValue.serverTimestamp(),
  };
  await db.collection("giftCards").doc(code).set(doc);
  return { code, buyerId, buyerName, amount, currency, recipientName: doc.recipientName, message: doc.message, status: "unclaimed", redeemedBy: null };
}

export async function getGiftCard(code: string): Promise<GiftCard | null> {
  const snap = await db.collection("giftCards").doc(code.toUpperCase()).get();
  if (!snap.exists) return null;
  return giftCardFromSnap(snap);
}

/** Claims a gift card and credits the recipient's wallet in one transaction — the gift card can
 * never end up marked claimed without the credit landing, or vice versa. */
export async function redeemGiftCard({ code, memberId }: { code: string; memberId: string }): Promise<GiftCard> {
  const normalizedCode = code.toUpperCase();
  await getOrCreateWallet(memberId);

  const giftRef = db.collection("giftCards").doc(normalizedCode);
  const walletRef = db.collection("wallets").doc(memberId);
  const entryRef = walletRef.collection("entries").doc(`gift_${normalizedCode}`);

  return db.runTransaction(async (tx) => {
    const [giftSnap, walletSnap] = await Promise.all([tx.get(giftRef), tx.get(walletRef)]);
    if (!giftSnap.exists) throw new GiftCardError("This gift code wasn't found. Double-check the code and try again.");
    const gift = giftSnap.data() as GiftCardDoc;
    if (gift.status === "claimed") throw new GiftCardError("This gift has already been redeemed.");
    if (!walletSnap.exists) throw new Error("Wallet not found.");

    const wallet = walletSnap.data() as { balance: number };
    const balanceAfter = wallet.balance + gift.amount;
    const now = FieldValue.serverTimestamp();

    tx.update(giftRef, { status: "claimed", redeemedBy: memberId, redeemedAt: now });
    tx.set(entryRef, { type: "gift_redeemed", amount: gift.amount, balanceAfter, referenceType: "gift_card", referenceId: normalizedCode, razorpayPaymentId: null, createdAt: now });
    tx.update(walletRef, { balance: balanceAfter, updatedAt: now });

    return { code: normalizedCode, buyerId: gift.buyerId, buyerName: gift.buyerName, amount: gift.amount, currency: gift.currency, recipientName: gift.recipientName, message: gift.message, status: "claimed", redeemedBy: memberId };
  });
}
