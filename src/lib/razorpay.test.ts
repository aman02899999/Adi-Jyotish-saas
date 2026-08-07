import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyRazorpayPaymentSignature, verifyRazorpaySubscriptionSignature, verifyRazorpayWebhookSignature } from "@/lib/razorpay";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.RAZORPAY_MODE = "test";
  process.env.RAZORPAY_TEST_KEY_SECRET = "test_secret_key";
  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("verifyRazorpayPaymentSignature", () => {
  it("accepts a correctly signed order/payment pair", () => {
    const signature = createHmac("sha256", "test_secret_key").update("order_1|pay_1").digest("hex");
    expect(verifyRazorpayPaymentSignature("order_1", "pay_1", signature)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const signature = createHmac("sha256", "test_secret_key").update("order_1|pay_1").digest("hex");
    expect(verifyRazorpayPaymentSignature("order_1", "pay_2", signature)).toBe(false);
  });

  it("rejects when no key secret is configured", () => {
    delete process.env.RAZORPAY_TEST_KEY_SECRET;
    delete process.env.RAZORPAY_KEY_SECRET;
    const signature = createHmac("sha256", "test_secret_key").update("order_1|pay_1").digest("hex");
    expect(verifyRazorpayPaymentSignature("order_1", "pay_1", signature)).toBe(false);
  });
});

describe("verifyRazorpaySubscriptionSignature", () => {
  it("accepts a correctly signed payment/subscription pair", () => {
    const signature = createHmac("sha256", "test_secret_key").update("pay_1|sub_1").digest("hex");
    expect(verifyRazorpaySubscriptionSignature("pay_1", "sub_1", signature)).toBe(true);
  });

  it("rejects a mismatched subscription id", () => {
    const signature = createHmac("sha256", "test_secret_key").update("pay_1|sub_1").digest("hex");
    expect(verifyRazorpaySubscriptionSignature("pay_1", "sub_2", signature)).toBe(false);
  });
});

describe("verifyRazorpayWebhookSignature", () => {
  it("accepts a correctly signed raw body", () => {
    const rawBody = JSON.stringify({ event: "payment.captured" });
    const signature = createHmac("sha256", "webhook_secret").update(rawBody).digest("hex");
    expect(verifyRazorpayWebhookSignature(rawBody, signature)).toBe(true);
  });

  it("rejects a body that doesn't match the signature", () => {
    const signature = createHmac("sha256", "webhook_secret").update(JSON.stringify({ event: "payment.captured" })).digest("hex");
    expect(verifyRazorpayWebhookSignature(JSON.stringify({ event: "payment.failed" }), signature)).toBe(false);
  });

  it("rejects when the webhook secret is missing", () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const rawBody = JSON.stringify({ event: "payment.captured" });
    expect(verifyRazorpayWebhookSignature(rawBody, "anything")).toBe(false);
  });
});
