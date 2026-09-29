import "server-only";

import { db } from "@/lib/firestore";
import { getReadingById, markReadingPaid } from "@/lib/ai-readings";
import { getOrderById, markOrderPaid } from "@/lib/gemstone-orders";
import { createGiftCard } from "@/lib/gift-cards";
import { getMemberContactInSupabase } from "@/lib/razorpay-webhook-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

/**
 * Readings, gemstone orders and gift cards are confirmed by the browser calling a verify route
 * after Razorpay checkout. A member who pays and closes the tab (or loses signal) before that call
 * has been charged and gets nothing: the reading stays unpaid, the order stays pending, and no gift
 * card exists. Razorpay's payment.captured webhook still arrives, so it settles the same records
 * with the same idempotent functions the verify routes use. Whichever arrives first wins; the
 * second is a no-op.
 */

export type CapturedPayment = { id: string; order_id?: string | null; amount?: number; currency?: string; notes?: Record<string, string> };

export type SettledKind = "reading" | "gemstone_order" | "gift_card";

async function memberName(memberId: string): Promise<string> {
  if (isSupabaseCutoverActive()) return (await getMemberContactInSupabase(memberId))?.name ?? "";
  const snap = await db.collection("members").doc(memberId).get();
  return (snap.data() as { name?: string } | undefined)?.name ?? "";
}

/** Settles the record a captured payment was for, when the browser never confirmed it. Each branch
 * checks the payment's order id against the one stored on the record, so notes alone can never
 * mark something paid. Returns what was settled, or null when the payment is not one of these. */
export async function settleUnconfirmedCapture(payment: CapturedPayment): Promise<SettledKind | null> {
  const notes = payment.notes ?? {};
  if (!payment.order_id) return null;

  if (notes.readingId && notes.memberId) {
    const reading = await getReadingById(notes.readingId, notes.memberId);
    if (!reading || reading.razorpayOrderId !== payment.order_id) return null;
    if (reading.status === "pending_payment") await markReadingPaid({ readingId: reading.id, razorpayPaymentId: payment.id });
    return "reading";
  }

  if (notes.gemstoneOrderId) {
    const order = await getOrderById(notes.gemstoneOrderId);
    if (!order || order.razorpayOrderId !== payment.order_id) return null;
    await markOrderPaid({ orderId: order.id, razorpayPaymentId: payment.id });
    return "gemstone_order";
  }

  if (notes.purpose === "gift_card" && notes.memberId && payment.amount != null) {
    await createGiftCard({
      buyerId: notes.memberId,
      buyerName: await memberName(notes.memberId),
      amount: Math.round(payment.amount / 100),
      currency: payment.currency ?? "INR",
      recipientName: notes.recipientName ?? "",
      message: notes.message ?? "",
      razorpayPaymentId: payment.id,
    });
    return "gift_card";
  }

  return null;
}
