import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

let razorpay: Razorpay | null = null;
let razorpayForKey: string | null = null;

/**
 * RAZORPAY_MODE picks between a dedicated test/live key pair (RAZORPAY_TEST_KEY_ID/SECRET,
 * RAZORPAY_LIVE_KEY_ID/SECRET) so switching modes is one env var, not a manual key swap.
 * Falls back to the legacy single RAZORPAY_KEY_ID/SECRET pair for existing deployments.
 */
export function getRazorpayMode(): "test" | "live" {
  return process.env.RAZORPAY_MODE === "live" ? "live" : "test";
}

export function getRazorpayCredentials() {
  const mode = getRazorpayMode();
  const prefix = mode === "live" ? "RAZORPAY_LIVE_KEY" : "RAZORPAY_TEST_KEY";
  const keyId = process.env[`${prefix}_ID`] || process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env[`${prefix}_SECRET`] || process.env.RAZORPAY_KEY_SECRET;
  return { mode, keyId, keySecret };
}

export function isRazorpayConfigured() {
  const { keyId, keySecret } = getRazorpayCredentials();
  return Boolean(keyId && keySecret);
}

export function getRazorpayKeyId() {
  return getRazorpayCredentials().keyId ?? null;
}

export function getRazorpay() {
  const { keyId, keySecret } = getRazorpayCredentials();
  if (!keyId || !keySecret) return null;

  if (!razorpay || razorpayForKey !== keyId) {
    razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    razorpayForKey = keyId;
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
  const { keySecret } = getRazorpayCredentials();
  if (!keySecret) return false;
  const expected = hmacHex(keySecret, `${orderId}|${paymentId}`);
  return safeEqual(expected, signature);
}

/** Verifies the client-returned signature for a subscription's first authorization payment (payment_id|subscription_id). */
export function verifyRazorpaySubscriptionSignature(paymentId: string, subscriptionId: string, signature: string) {
  const { keySecret } = getRazorpayCredentials();
  if (!keySecret) return false;
  const expected = hmacHex(keySecret, `${paymentId}|${subscriptionId}`);
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
