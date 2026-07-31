import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getStudioSettings } from "@/lib/studio-settings";

export class InsufficientBalanceError extends Error {}
export class WalletHoldNotFoundError extends Error {}

export type Wallet = {
  id: string; // == memberId
  memberId: string;
  currency: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
};

export type WalletEntry = {
  id: string;
  walletId: string; // == memberId
  type: string;
  amount: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  razorpayPaymentId: string | null;
  createdAt: Date;
};

export type WalletHold = {
  id: string;
  walletId: string; // == memberId
  amount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDate(value: FirebaseFirestore.Timestamp | Date | undefined | null): Date {
  if (!value) return new Date();
  return value instanceof Date ? value : value.toDate();
}

function walletsCollection() {
  return db.collection("wallets");
}

function walletFromSnap(snap: FirebaseFirestore.DocumentSnapshot): Wallet {
  const data = snap.data() as Omit<Wallet, "id" | "memberId" | "createdAt" | "updatedAt"> & {
    createdAt?: FirebaseFirestore.Timestamp;
    updatedAt?: FirebaseFirestore.Timestamp;
  };
  return {
    id: snap.id,
    memberId: snap.id,
    currency: data.currency,
    balance: data.balance,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function entryFromSnap(snap: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot, walletId: string): WalletEntry {
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    walletId,
    type: data.type as string,
    amount: data.amount as number,
    balanceAfter: data.balanceAfter as number,
    referenceType: (data.referenceType as string | null) ?? null,
    referenceId: (data.referenceId as string | null) ?? null,
    razorpayPaymentId: (data.razorpayPaymentId as string | null) ?? null,
    createdAt: toDate(data.createdAt as FirebaseFirestore.Timestamp),
  };
}

function holdFromSnap(snap: FirebaseFirestore.DocumentSnapshot, walletId: string): WalletHold {
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    walletId,
    amount: data.amount as number,
    status: data.status as string,
    createdAt: toDate(data.createdAt as FirebaseFirestore.Timestamp),
    updatedAt: toDate(data.updatedAt as FirebaseFirestore.Timestamp),
  };
}

function isAlreadyExists(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === 6);
}

/** Wallet doc id == memberId, so creation is a simple `create()` (fails if it already exists,
 * exactly like the old `onConflictDoNothing` on `wallets.memberId`) rather than a lock+upsert. */
export async function getOrCreateWallet(memberId: string): Promise<Wallet> {
  const ref = walletsCollection().doc(memberId);
  const existing = await ref.get();
  if (existing.exists) return walletFromSnap(existing);

  const settings = await getStudioSettings();
  try {
    await ref.create({
      currency: settings.currency,
      balance: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }
  const snap = await ref.get();
  return walletFromSnap(snap);
}

export async function getWalletHistory(walletId: string): Promise<WalletEntry[]> {
  const snap = await walletsCollection().doc(walletId).collection("entries").orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => entryFromSnap(doc, walletId));
}

export async function getActiveHold(memberId: string, holdId: string): Promise<WalletHold | null> {
  const snap = await walletsCollection().doc(memberId).collection("holds").doc(holdId).get();
  if (!snap.exists) return null;
  return holdFromSnap(snap, memberId);
}

/** Credits a wallet. Idempotent per razorpayPaymentId: that id is used as the ledger entry's
 * doc id, so re-delivery (webhook + client verification both calling this) just finds the entry
 * already there and no-ops, mirroring the old unique-constraint-catch pattern. The whole
 * read-balance/write-entry/write-balance sequence runs inside one Firestore transaction, which
 * is how atomicity + isolation is guaranteed here (Firestore auto-retries the transaction if the
 * wallet doc changes concurrently — the equivalent of the old `pg_advisory_xact_lock`). */
export async function rechargeWallet({ memberId, amount, razorpayPaymentId }: { memberId: string; amount: number; razorpayPaymentId: string }): Promise<Wallet> {
  await getOrCreateWallet(memberId);
  const walletRef = walletsCollection().doc(memberId);
  const entryRef = walletRef.collection("entries").doc(razorpayPaymentId);

  return db.runTransaction(async (tx) => {
    const [walletSnap, entrySnap] = await Promise.all([tx.get(walletRef), tx.get(entryRef)]);
    if (!walletSnap.exists) throw new Error("Wallet not found.");
    const wallet = walletFromSnap(walletSnap);
    if (entrySnap.exists) return wallet; // already processed — idempotent no-op

    const balanceAfter = wallet.balance + amount;
    tx.set(entryRef, {
      type: "recharge",
      amount,
      balanceAfter,
      referenceType: null,
      referenceId: null,
      razorpayPaymentId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(walletRef, { balance: balanceAfter, updatedAt: FieldValue.serverTimestamp() });
    return { ...wallet, balance: balanceAfter };
  });
}

/** Reserves funds against a wallet. Throws InsufficientBalanceError if the wallet cannot cover the amount. */
export async function createHold({ memberId, amount, referenceType }: { memberId: string; amount: number; referenceType: string }): Promise<WalletHold> {
  await getOrCreateWallet(memberId);
  const walletRef = walletsCollection().doc(memberId);
  const holdRef = walletRef.collection("holds").doc();
  const entryRef = walletRef.collection("entries").doc();

  return db.runTransaction(async (tx) => {
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists) throw new Error("Wallet not found.");
    const wallet = walletFromSnap(walletSnap);
    if (wallet.balance < amount) throw new InsufficientBalanceError("Your wallet balance is too low to start this session.");

    const balanceAfter = wallet.balance - amount;
    const now = FieldValue.serverTimestamp();
    tx.set(holdRef, { amount, status: "active", createdAt: now, updatedAt: now });
    tx.set(entryRef, { type: "hold", amount: -amount, balanceAfter, referenceType, referenceId: holdRef.id, razorpayPaymentId: null, createdAt: now });
    tx.update(walletRef, { balance: balanceAfter, updatedAt: now });

    return { id: holdRef.id, walletId: memberId, amount, status: "active", createdAt: new Date(), updatedAt: new Date() };
  });
}

/** Settles a hold: keeps `capturedAmount` as consumed and refunds the unused remainder, if any.
 * Requires `memberId` (the wallet doc id) alongside `holdId` because holds now live in a
 * per-wallet subcollection — a bare hold id is no longer globally addressable the way the old
 * serial primary key was. */
export async function captureHold({ memberId, holdId, capturedAmount, referenceType }: { memberId: string; holdId: string; capturedAmount: number; referenceType: string }): Promise<WalletHold> {
  const walletRef = walletsCollection().doc(memberId);
  const holdRef = walletRef.collection("holds").doc(holdId);

  return db.runTransaction(async (tx) => {
    const holdSnap = await tx.get(holdRef);
    if (!holdSnap.exists) throw new WalletHoldNotFoundError("Wallet hold not found.");
    const hold = holdFromSnap(holdSnap, memberId);
    if (hold.status !== "active") return hold;

    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists) throw new Error("Wallet not found.");
    const wallet = walletFromSnap(walletSnap);

    const clampedCapture = Math.max(0, Math.min(capturedAmount, hold.amount));
    const refund = hold.amount - clampedCapture;
    const now = FieldValue.serverTimestamp();

    if (refund > 0) {
      const balanceAfter = wallet.balance + refund;
      const entryRef = walletRef.collection("entries").doc();
      tx.set(entryRef, { type: "release", amount: refund, balanceAfter, referenceType, referenceId: holdId, razorpayPaymentId: null, createdAt: now });
      tx.update(walletRef, { balance: balanceAfter, updatedAt: now });
    }
    tx.update(holdRef, { status: "captured", updatedAt: now });

    return { ...hold, status: "captured" };
  });
}

/** Fully releases a hold back to the wallet (e.g. a session that never started). */
export async function releaseHold({ memberId, holdId, referenceType }: { memberId: string; holdId: string; referenceType: string }): Promise<WalletHold> {
  const walletRef = walletsCollection().doc(memberId);
  const holdRef = walletRef.collection("holds").doc(holdId);

  return db.runTransaction(async (tx) => {
    const holdSnap = await tx.get(holdRef);
    if (!holdSnap.exists) throw new WalletHoldNotFoundError("Wallet hold not found.");
    const hold = holdFromSnap(holdSnap, memberId);
    if (hold.status !== "active") return hold;

    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists) throw new Error("Wallet not found.");
    const wallet = walletFromSnap(walletSnap);

    const balanceAfter = wallet.balance + hold.amount;
    const now = FieldValue.serverTimestamp();
    const entryRef = walletRef.collection("entries").doc();
    tx.set(entryRef, { type: "release", amount: hold.amount, balanceAfter, referenceType, referenceId: holdId, razorpayPaymentId: null, createdAt: now });
    tx.update(walletRef, { balance: balanceAfter, updatedAt: now });
    tx.update(holdRef, { status: "released", updatedAt: now });

    return { ...hold, status: "released" };
  });
}

export async function getAdminWalletSummary(): Promise<{ totalBalance: number; walletCount: number }> {
  const { AggregateField } = await import("firebase-admin/firestore");
  const snap = await walletsCollection().aggregate({
    totalBalance: AggregateField.sum("balance"),
    walletCount: AggregateField.count(),
  }).get();
  const data = snap.data();
  return { totalBalance: data.totalBalance ?? 0, walletCount: data.walletCount ?? 0 };
}

type MemberLite = { name: string; email: string };

async function memberLiteById(memberId: string): Promise<MemberLite> {
  const snap = await db.collection("members").doc(memberId).get();
  const data = snap.data() as { name?: string; email?: string } | undefined;
  return { name: data?.name ?? "Unknown member", email: data?.email ?? "" };
}

export async function getAdminWalletLedger(limit = 200): Promise<Array<WalletEntry & { memberName: string; memberEmail: string; currency: string }>> {
  const snap = await db.collectionGroup("entries").orderBy("createdAt", "desc").limit(limit).get();
  const memberIds = new Set<string>();
  const rows = snap.docs.map((doc) => {
    const walletId = doc.ref.parent.parent!.id;
    memberIds.add(walletId);
    return { entry: entryFromSnap(doc, walletId), walletId };
  });

  const memberCache = new Map<string, MemberLite>();
  const walletCurrencyCache = new Map<string, string>();
  await Promise.all(Array.from(memberIds).map(async (memberId) => {
    const [member, walletSnap] = await Promise.all([memberLiteById(memberId), walletsCollection().doc(memberId).get()]);
    memberCache.set(memberId, member);
    walletCurrencyCache.set(memberId, (walletSnap.data()?.currency as string | undefined) ?? "INR");
  }));

  return rows.map(({ entry, walletId }) => ({
    ...entry,
    memberName: memberCache.get(walletId)?.name ?? "Unknown member",
    memberEmail: memberCache.get(walletId)?.email ?? "",
    currency: walletCurrencyCache.get(walletId) ?? "INR",
  }));
}

export async function getAdminWalletBalances(): Promise<Array<Wallet & { memberName: string; memberEmail: string }>> {
  const snap = await walletsCollection().orderBy("balance", "desc").get();
  const wallets = snap.docs.map((doc) => walletFromSnap(doc));
  const members = await Promise.all(wallets.map((wallet) => memberLiteById(wallet.memberId)));
  return wallets.map((wallet, index) => ({ ...wallet, memberName: members[index].name, memberEmail: members[index].email }));
}
