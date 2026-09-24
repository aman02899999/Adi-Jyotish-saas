import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

/**
 * Confirming a payment the browser says succeeded.
 *
 * The signature is the whole security of this route. Without it, any signed-in member could POST
 * an invented payment id against their own invoice and have it marked paid — the client is the
 * one reporting success, so the only thing distinguishing a real payment from a claimed one is a
 * value only Razorpay could have produced.
 *
 * verifyRazorpayPaymentSignature is the real implementation here rather than a mock. That matters
 * beyond "was it called": it is computed over `orderId|paymentId`, so a route that passed those
 * in the wrong order, or passed a constant, would still reject forgeries while also rejecting
 * genuine payments — or, worse, accept one invoice's signature against another.
 */

const KEY_SECRET = "rzp_secret_for_tests";

const h = vi.hoisted(() => ({
  member: { id: "member-1", email: "asha@example.com" } as { id: string; email: string } | null,
  invoice: null as Record<string, unknown> | null,
  payment: null as { id: string; status: string } | null,
  booking: null as Record<string, unknown> | null,
  confirmed: [] as Array<Record<string, unknown>>,
  notified: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/member-auth", () => ({ getCurrentMember: async () => h.member }));
vi.mock("@/lib/messaging", () => ({
  sendBookingNotification: async (n: Record<string, unknown>) => { h.notified.push(n); },
}));
vi.mock("@/lib/invoice-actions", () => ({
  getInvoiceById: async () => h.invoice,
  getPaymentForOrder: async () => h.payment,
  getBookingForInvoice: async () => h.booking,
  confirmInvoicePayment: async (row: Record<string, unknown>) => { h.confirmed.push(row); },
}));

import { POST } from "./route";

const INVOICE = {
  id: "inv-1", number: "INV-2026-0001", memberId: "member-1",
  customerEmail: "asha@example.com", amount: 1500, currency: "INR", bookingId: "booking-1",
};

const ORDER = "order_1";
const PAYMENT = "pay_1";

function signature(orderId = ORDER, paymentId = PAYMENT) {
  return createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
}

const params = Promise.resolve({ id: "inv-1" });
function post(body: Record<string, unknown>) {
  return POST(new Request("https://example.test/x", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }), { params });
}

const valid = () => ({ razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: signature() });

beforeEach(() => {
  vi.stubEnv("RAZORPAY_KEY_SECRET", KEY_SECRET);
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
  h.member = { id: "member-1", email: "asha@example.com" };
  h.invoice = { ...INVOICE };
  h.payment = { id: "payment-row-1", status: "pending" };
  h.booking = { id: "booking-1", reference: "BK-1", serviceTitle: "Kundli" };
  h.confirmed = [];
  h.notified = [];
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("access", () => {
  it("requires a signed-in member", async () => {
    h.member = null;
    expect((await post(valid())).status).toBe(401);
    expect(h.confirmed).toHaveLength(0);
  });

  it("answers 404 — not 403 — for somebody else's invoice", async () => {
    h.invoice = { ...INVOICE, memberId: "someone-else", customerEmail: "other@example.com" };
    const response = await post(valid());
    expect(response.status).toBe(404);
    expect(h.confirmed).toHaveLength(0);
  });

  it("answers 404 for an invoice that does not exist", async () => {
    h.invoice = null;
    expect((await post(valid())).status).toBe(404);
  });

  it("answers 404 when no payment attempt matches this invoice and order", async () => {
    // Stops a genuine signature for one invoice's order being replayed against another.
    h.payment = null;
    expect((await post(valid())).status).toBe(404);
    expect(h.confirmed).toHaveLength(0);
  });
});

describe("required fields", () => {
  it.each([
    ["order id", { razorpay_payment_id: PAYMENT, razorpay_signature: signature() }],
    ["payment id", { razorpay_order_id: ORDER, razorpay_signature: signature() }],
    ["signature", { razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT }],
  ])("refuses a body missing the %s", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(h.confirmed).toHaveLength(0);
  });

  it("treats whitespace-only fields as missing", async () => {
    expect((await post({ razorpay_order_id: "  ", razorpay_payment_id: PAYMENT, razorpay_signature: signature() })).status).toBe(400);
  });
});

describe("signature verification", () => {
  it("confirms the payment on a valid signature", async () => {
    const response = await post(valid());
    expect(response.status).toBe(200);
    expect(h.confirmed).toHaveLength(1);
    expect(h.confirmed[0]).toMatchObject({
      paymentId: "payment-row-1", invoiceId: "inv-1", bookingId: "booking-1", paymentIntentId: PAYMENT,
    });
  });

  it("refuses an invented signature and confirms nothing", async () => {
    const response = await post({ ...valid(), razorpay_signature: "deadbeef" });
    expect(response.status).toBe(400);
    expect(h.confirmed).toHaveLength(0);
  });

  it("refuses a signature computed over a different payment id", async () => {
    // The attack: pay 1 rupee, then claim that payment settled a larger invoice's order.
    const response = await post({ ...valid(), razorpay_signature: signature(ORDER, "pay_someone_elses") });
    expect(response.status).toBe(400);
    expect(h.confirmed).toHaveLength(0);
  });

  it("refuses a signature computed over a different order id", async () => {
    const response = await post({ ...valid(), razorpay_signature: signature("order_other", PAYMENT) });
    expect(response.status).toBe(400);
    expect(h.confirmed).toHaveLength(0);
  });

  it("refuses a signature made with the wrong secret", async () => {
    const forged = createHmac("sha256", "not-the-secret").update(`${ORDER}|${PAYMENT}`).digest("hex");
    expect((await post({ ...valid(), razorpay_signature: forged })).status).toBe(400);
    expect(h.confirmed).toHaveLength(0);
  });

  it("refuses everything when no key secret is configured", async () => {
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    expect((await post(valid())).status).toBe(400);
    expect(h.confirmed).toHaveLength(0);
  });
});

describe("idempotency and follow-through", () => {
  it("reports an already-settled payment without confirming it twice", async () => {
    // The browser retries this call; a second confirm would re-run the booking transaction.
    h.payment = { id: "payment-row-1", status: "succeeded" };
    const response = await post(valid());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, alreadyPaid: true });
    expect(h.confirmed).toHaveLength(0);
  });

  it("short-circuits a settled payment before checking the signature", async () => {
    // A retry after the browser has discarded the signature must still succeed.
    h.payment = { id: "payment-row-1", status: "succeeded" };
    const response = await post({ razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: "stale" });
    await expect(response.json()).resolves.toEqual({ ok: true, alreadyPaid: true });
  });

  it("refuses when the booking behind the invoice is gone", async () => {
    h.booking = null;
    expect((await post(valid())).status).toBe(404);
    expect(h.confirmed).toHaveLength(0);
  });

  it("emails the receipt to the invoice's address, not the session's", async () => {
    h.invoice = { ...INVOICE, memberId: "member-1", customerEmail: "billing@example.com" };
    await post(valid());
    expect(h.notified[0]).toMatchObject({ memberEmail: "billing@example.com", bookingId: "booking-1" });
  });
});
