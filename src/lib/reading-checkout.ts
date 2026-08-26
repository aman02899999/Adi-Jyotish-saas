import "server-only";

import { generateReadingAnswer, markReadingPaidWithoutCharge, payReadingFromWallet, type AiReading } from "@/lib/ai-readings";
import { memberBypassesPayment } from "@/lib/payment-bypass";
import type { MemberIdentity } from "@/lib/member-auth";
import { quoteWalletPayment } from "@/lib/wallet";

/**
 * The wallet half of every reading's checkout, in one place.
 *
 * Each reading route used to have exactly one way to be paid for: mint a Razorpay order, bounce
 * the member through a card checkout, then verify the signature on the way back. That is a lot of
 * friction for someone who already has money sitting in their wallet, and it meant the wallet was
 * only good for instant chat while every other paid feature ignored it.
 *
 * Routes now call this first. It either settles the reading from the wallet and returns the
 * finished answer in the same request — no redirect, no card, no verify round-trip — or it returns
 * a 402 that tells the client exactly how short the member is, so the UI can say "add ₹150" and
 * link to recharge instead of failing with a bare error.
 *
 * Card checkout is untouched: a member with no balance, or who would rather pay directly, still
 * goes through Razorpay exactly as before.
 */

export type WalletShortfall = {
  balance: number;
  price: number;
  shortfall: number;
  currency: string;
};

/**
 * Settles `reading` from the member's wallet, or explains why it cannot be.
 *
 * Returns a Response in both cases; the caller should return it as-is. Answer generation failing
 * is deliberately NOT treated as a payment failure: the money has moved and the reading is marked
 * paid, so the member gets a 201 telling them it is being prepared, and the existing retry path
 * picks it up — exactly how the Razorpay verify route already behaves.
 */
export async function settleReadingFromWallet(member: MemberIdentity, reading: AiReading): Promise<Response> {
  const memberId = member.id;

  // A QA bypass account skips the charge entirely and goes straight to the answer, so the whole
  // product can be walked end to end without a card or a funded wallet.
  if (memberBypassesPayment(member)) {
    const free = await markReadingPaidWithoutCharge({ readingId: reading.id, memberId });
    if (!free) return Response.json({ error: "Reading not found." }, { status: 404 });
    return respondWithAnswer(free, { bypass: true });
  }

  const quote = await quoteWalletPayment(memberId, reading.price);
  if (!quote.sufficient) {
    return Response.json({
      error: `Your wallet has ${quote.currency} ${quote.balance}. This reading costs ${quote.currency} ${quote.price} — add ${quote.currency} ${quote.shortfall} to continue.`,
      insufficientBalance: true,
      readingId: reading.id,
      wallet: { balance: quote.balance, price: quote.price, shortfall: quote.shortfall, currency: quote.currency } satisfies WalletShortfall,
    }, { status: 402 });
  }

  const paid = await payReadingFromWallet({ readingId: reading.id, memberId });
  if (!paid) return Response.json({ error: "Reading not found." }, { status: 404 });
  return respondWithAnswer(paid, { bypass: false });
}

/** Generates and returns the answer for a reading that is already paid for, by whichever route.
 * A generation failure is never reported as a payment failure — the money has moved and the
 * reading is marked paid, so the member is told it is being prepared and the existing retry path
 * picks it up, exactly as the Razorpay verify route already behaves. */
async function respondWithAnswer(reading: AiReading, { bypass }: { bypass: boolean }): Promise<Response> {
  const settledBy = bypass ? { bypass: true } : { wallet: true };
  try {
    const answered = await generateReadingAnswer(reading);
    return Response.json({ ...settledBy, readingId: reading.id, status: answered.status, answer: answered.answer }, { status: 201 });
  } catch (error) {
    return Response.json({
      ...settledBy,
      readingId: reading.id,
      status: "paid",
      answer: null,
      message: "Your reading is still being prepared — check back in a moment or refresh.",
      detail: error instanceof Error ? error.message : undefined,
    }, { status: 201 });
  }
}
