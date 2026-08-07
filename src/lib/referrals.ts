import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { creditWalletBonus } from "@/lib/wallet";

// Placeholder reward amounts (INR) — easy to retune, not yet exposed in the admin UI.
export const REFERRAL_REFERRER_REWARD = 150;
export const REFERRAL_REFEREE_REWARD = 100;
// Requiring a real, meaningfully-sized recharge before paying out is what actually closes the
// "farm it with throwaway accounts" hole — the general wallet top-up minimum is just ₹50, well
// under REFERRAL_REFEREE_REWARD, so without this floor one person could profit by creating
// unlimited accounts, each referred by their own main account, each topped up with just enough
// to trigger the reward. At 500 the mechanic only ever returns *some* of a genuinely large
// top-up, not a profit on a token one.
export const MIN_RECHARGE_FOR_REWARD = 500;
// Bounds worst-case exposure from any other abuse pattern this doesn't anticipate — legitimate
// referrers realistically never get near this through organic word-of-mouth.
const MAX_REWARDED_REFERRALS_PER_REFERRER = 50;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — avoids look-alike mistakes

function randomCode(length = 7) {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

function membersCollection() {
  return db.collection("members");
}

/** Every member gets a referral code lazily — generated on first read for members created before
 * this feature shipped, and at signup for everyone after. Retries on the rare collision. */
export async function ensureReferralCode(memberId: string): Promise<string> {
  const ref = membersCollection().doc(memberId);
  const snap = await ref.get();
  const existing = snap.data()?.referralCode as string | undefined;
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const clash = await membersCollection().where("referralCode", "==", code).limit(1).get();
    if (clash.empty) {
      await ref.update({ referralCode: code });
      return code;
    }
  }
  throw new Error("Could not allocate a unique referral code.");
}

async function findMemberIdByReferralCode(code: string): Promise<string | null> {
  const snap = await membersCollection().where("referralCode", "==", code).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

/** Called right after a brand-new member document is created. Looks up the referrer by their
 * code and, if valid, records a pending referral — no wallet credit yet, that only happens once
 * the referee actually pays for something (see processReferralReward), which is what keeps this
 * safe against fake-account farming. */
export async function recordReferral({ refereeId, code }: { refereeId: string; code: string }) {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return;

  const referrerId = await findMemberIdByReferralCode(trimmed);
  if (!referrerId || referrerId === refereeId) return;

  const referralRef = db.collection("referrals").doc(refereeId);
  await referralRef.create({
    referrerId,
    refereeId,
    code: trimmed,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  }).catch(() => {
    // A referral doc for this referee already exists (shouldn't happen for a brand-new member,
    // but create() throwing on a pre-existing doc is the safe outcome either way) — no-op.
  });
}

/** Fires on every successful wallet recharge; only actually pays out once it finds a "pending"
 * referral for this member AND the triggering recharge clears MIN_RECHARGE_FOR_REWARD — a small
 * first recharge leaves the referral "pending" rather than consuming it, so a later, larger
 * recharge can still trigger it. Safe to call repeatedly (idempotent wallet ledger entries + the
 * status flip both guard against double-pay). */
export async function processReferralReward(memberId: string, rechargeAmount: number) {
  if (rechargeAmount < MIN_RECHARGE_FOR_REWARD) return;

  const referralRef = db.collection("referrals").doc(memberId);
  const snap = await referralRef.get();
  if (!snap.exists) return;
  const referral = snap.data() as { referrerId: string; status: string };
  if (referral.status !== "pending") return;

  await creditWalletBonus({
    memberId,
    amount: REFERRAL_REFEREE_REWARD,
    type: "referral_bonus",
    referenceType: "referral",
    referenceId: `referral_referee_${memberId}`,
  });

  const rewardedCountSnap = await db.collection("referrals")
    .where("referrerId", "==", referral.referrerId)
    .where("status", "==", "rewarded")
    .count().get();
  const referrerCapped = rewardedCountSnap.data().count >= MAX_REWARDED_REFERRALS_PER_REFERRER;

  if (!referrerCapped) {
    await creditWalletBonus({
      memberId: referral.referrerId,
      amount: REFERRAL_REFERRER_REWARD,
      type: "referral_bonus",
      referenceType: "referral",
      referenceId: `referral_referrer_${memberId}`,
    });
  }

  await referralRef.update({ status: referrerCapped ? "capped" : "rewarded", rewardedAt: FieldValue.serverTimestamp() });
}

export type ReferralStats = {
  code: string;
  invited: number;
  rewarded: number;
  totalEarned: number;
};

export async function getReferralStats(memberId: string): Promise<ReferralStats> {
  const code = await ensureReferralCode(memberId);
  const snap = await db.collection("referrals").where("referrerId", "==", memberId).get();
  const invited = snap.size;
  const rewarded = snap.docs.filter((doc) => doc.data().status === "rewarded").length;
  return { code, invited, rewarded, totalEarned: rewarded * REFERRAL_REFERRER_REWARD };
}
