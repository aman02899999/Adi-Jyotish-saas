import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

let razorpay: Razorpay | null = null;

export function isRazorpayConfigured() {
  return Boolean(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
  );
}

export function getRazorpay() {
  if (!isRazorpayConfigured()) {
    return null;
  }

  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }

  return razorpay;
}

function safeEqual(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function hmacHex(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Verifies the client-returned signature for a one-time order payment (order_id|payment_id). */
export function verifyRazorpayPaymentSignature(orderId: string, paymentId: string, signature: string) {
  if (!process.env.RAZORPAY_KEY_SECRET) return false;
  const expected = hmacHex(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
  return safeEqual(expected, signature);
}

/** Verifies the client-returned signature for a subscription's first authorization payment (payment_id|subscription_id). */
export function verifyRazorpaySubscriptionSignature(paymentId: string, subscriptionId: string, signature: string) {
  if (!process.env.RAZORPAY_KEY_SECRET) return false;
  const expected = hmacHex(process.env.RAZORPAY_KEY_SECRET, `${paymentId}|${subscriptionId}`);
  return safeEqual(expected, signature);
}

export function isRazorpayWebhookConfigured() {
  return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
}

/** Verifies an inbound webhook request against the raw request body. */
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = hmacHex(secret, rawBody);
  return safeEqual(expected, signature);
}
