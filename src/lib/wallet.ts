import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers, wallets, walletEntries, walletHolds, type Wallet } from "@/db/schema";
import { getStudioSettings } from "@/lib/studio-settings";

export class InsufficientBalanceError extends Error {}
export class WalletHoldNotFoundError extends Error {}

const WALLET_LOCK_OFFSET = 2_000_000_000;

async function lockWallet(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], walletId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(${WALLET_LOCK_OFFSET + walletId})`);
  const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, walletId)).limit(1);
  if (!wallet) throw new Error("Wallet not found.");
  return wallet;
}

export async function getOrCreateWallet(memberId: number): Promise<Wallet> {
  const settings = await getStudioSettings();
  await db.insert(wallets).values({ memberId, currency: settings.currency }).onConflictDoNothing({ target: wallets.memberId });
  const [wallet] = await db.select().from(wallets).where(eq(wallets.memberId, memberId)).limit(1);
  return wallet;
}

export async function getWalletHistory(walletId: number) {
  return db.select().from(walletEntries).where(eq(walletEntries.walletId, walletId)).orderBy(desc(walletEntries.createdAt));
}

export async function getActiveHold(sessionWalletHoldId: number) {
  const [hold] = await db.select().from(walletHolds).where(eq(walletHolds.id, sessionWalletHoldId)).limit(1);
  return hold ?? null;
}

/** Credits a wallet. Idempotent per razorpayPaymentId so webhook + client verification can both call it safely. */
export async function rechargeWallet({ memberId, amount, razorpayPaymentId }: { memberId: number; amount: number; razorpayPaymentId: string }) {
  const wallet = await getOrCreateWallet(memberId);
  const [existing] = await db.select().from(walletEntries).where(eq(walletEntries.razorpayPaymentId, razorpayPaymentId)).limit(1);
  if (existing) return wallet;

  return db.transaction(async (tx) => {
    const locked = await lockWallet(tx, wallet.id);
    const balanceAfter = locked.balance + amount;
    try {
      await tx.insert(walletEntries).values({ walletId: locked.id, type: "recharge", amount, balanceAfter, razorpayPaymentId });
    } catch {
      return locked;
    }
    const [updated] = await tx.update(wallets).set({ balance: balanceAfter, updatedAt: new Date() }).where(eq(wallets.id, locked.id)).returning();
    return updated;
  });
}

/** Reserves funds against a wallet. Throws InsufficientBalanceError if the wallet cannot cover the amount. */
export async function createHold({ memberId, amount, referenceType }: { memberId: number; amount: number; referenceType: string }) {
  const wallet = await getOrCreateWallet(memberId);
  return db.transaction(async (tx) => {
    const locked = await lockWallet(tx, wallet.id);
    if (locked.balance < amount) throw new InsufficientBalanceError("Your wallet balance is too low to start this session.");
    const balanceAfter = locked.balance - amount;
    const [hold] = await tx.insert(walletHolds).values({ walletId: locked.id, amount, status: "active" }).returning();
    await tx.insert(walletEntries).values({ walletId: locked.id, type: "hold", amount: -amount, balanceAfter, referenceType, referenceId: String(hold.id) });
    await tx.update(wallets).set({ balance: balanceAfter, updatedAt: new Date() }).where(eq(wallets.id, locked.id));
    return hold;
  });
}

/** Settles a hold: keeps `capturedAmount` as consumed and refunds the unused remainder, if any. */
export async function captureHold({ holdId, capturedAmount, referenceType }: { holdId: number; capturedAmount: number; referenceType: string }) {
  return db.transaction(async (tx) => {
    const [hold] = await tx.select().from(walletHolds).where(eq(walletHolds.id, holdId)).limit(1);
    if (!hold) throw new WalletHoldNotFoundError("Wallet hold not found.");
    if (hold.status !== "active") return hold;
    const locked = await lockWallet(tx, hold.walletId);
    const clampedCapture = Math.max(0, Math.min(capturedAmount, hold.amount));
    const refund = hold.amount - clampedCapture;
    let balanceAfter = locked.balance;
    if (refund > 0) {
      balanceAfter = locked.balance + refund;
      await tx.insert(walletEntries).values({ walletId: locked.id, type: "release", amount: refund, balanceAfter, referenceType, referenceId: String(hold.id) });
      await tx.update(wallets).set({ balance: balanceAfter, updatedAt: new Date() }).where(eq(wallets.id, locked.id));
    }
    const [updated] = await tx.update(walletHolds).set({ status: "captured", updatedAt: new Date() }).where(eq(walletHolds.id, holdId)).returning();
    return updated;
  });
}

export async function getAdminWalletSummary() {
  const [row] = await db.select({ totalBalance: sql<number>`coalesce(sum(${wallets.balance}),0)::int`, walletCount: sql<number>`count(*)::int` }).from(wallets);
  return { totalBalance: row?.totalBalance ?? 0, walletCount: row?.walletCount ?? 0 };
}

export async function getAdminWalletLedger(limit = 200) {
  const rows = await db.select({ entry: walletEntries, memberName: memberUsers.name, memberEmail: memberUsers.email, currency: wallets.currency })
    .from(walletEntries)
    .innerJoin(wallets, eq(walletEntries.walletId, wallets.id))
    .innerJoin(memberUsers, eq(wallets.memberId, memberUsers.id))
    .orderBy(desc(walletEntries.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row.entry, memberName: row.memberName, memberEmail: row.memberEmail, currency: row.currency }));
}

export async function getAdminWalletBalances() {
  const rows = await db.select({ wallet: wallets, memberName: memberUsers.name, memberEmail: memberUsers.email })
    .from(wallets)
    .innerJoin(memberUsers, eq(wallets.memberId, memberUsers.id))
    .orderBy(desc(wallets.balance));
  return rows.map((row) => ({ ...row.wallet, memberName: row.memberName, memberEmail: row.memberEmail }));
}

/** Fully releases a hold back to the wallet (e.g. a session that never started). */
export async function releaseHold({ holdId, referenceType }: { holdId: number; referenceType: string }) {
  return db.transaction(async (tx) => {
    const [hold] = await tx.select().from(walletHolds).where(eq(walletHolds.id, holdId)).limit(1);
    if (!hold) throw new WalletHoldNotFoundError("Wallet hold not found.");
    if (hold.status !== "active") return hold;
    const locked = await lockWallet(tx, hold.walletId);
    const balanceAfter = locked.balance + hold.amount;
    await tx.insert(walletEntries).values({ walletId: locked.id, type: "release", amount: hold.amount, balanceAfter, referenceType, referenceId: String(hold.id) });
    await tx.update(wallets).set({ balance: balanceAfter, updatedAt: new Date() }).where(eq(wallets.id, locked.id));
    const [updated] = await tx.update(walletHolds).set({ status: "released", updatedAt: new Date() }).where(eq(walletHolds.id, holdId)).returning();
    return updated;
  });
}
