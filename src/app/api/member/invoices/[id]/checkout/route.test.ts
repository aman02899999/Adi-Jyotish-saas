import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Paying an invoice. Two properties carry the weight here.
 *
 * Ownership: an invoice belonging to someone else answers 404, not 403 — deliberately
 * indistinguishable from one that does not exist, so the endpoint cannot be used to enumerate
 * invoice ids.
 *
 * Double payment: a customer whose payment has gone through but whose webhook has not landed yet
 * still sees an "open" invoice for a few seconds. If checkout mints a fresh Razorpay order in that
 * window, they can be charged twice for one invoice with nothing in the app to catch the second
 * charge. The reuse window is the guard, and its three edges — fresh, stale, and an order Razorpay
 * has already moved on from — are each pinned below.
 */

const h = vi.hoisted(() => ({
  member: { id: "member-1", email: "asha@example.com" } as { id: string; email: string } | null,
  invoice: null as Record<string, unknown> | null,
  booking: { id: "booking-1", status: "confirmed" } as Record<string, unknown> | null,
  pendingPayment: null as { providerSessionId: string; createdAt: Date } | null,
  razorpayConfigured: true,
  fetchedOrderStatus: "created",
  created: [] as Array<Record<string, unknown>>,
  recorded: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/member-auth", () => ({ getCurrentMember: async () => h.member }));
vi.mock("@/lib/razorpay", () => ({
  getRazorpayKeyId: () => "rzp_test_key",
  getRazorpay: () => h.razorpayConfigured ? {
    orders: {
      fetch: async (id: string) => ({ id, status: h.fetchedOrderStatus, amount: 150000, currency: "INR" }),
      create: async (opts: Record<string, unknown>) => {
        h.created.push(opts);
        return { id: "order_new", amount: opts.amount, currency: opts.currency };
      },
    },
  } : null,
}));
vi.mock("@/lib/invoice-actions", () => ({
  getInvoiceById: async () => h.invoice,
  getBookingForInvoice: async () => h.booking,
  getReusablePendingPayment: async () => h.pendingPayment,
  recordPendingPayment: async (row: Record<string, unknown>) => { h.recorded.push(row); },
}));

import { POST } from "./route";

const INVOICE = {
  id: "inv-1", number: "INV-2026-0001", memberId: "member-1",
  customerEmail: "asha@example.com", status: "open", amount: 1500, currency: "INR", bookingId: "booking-1",
};

const params = Promise.resolve({ id: "inv-1" });
const post = () => POST(new Request("https://example.test/x", { method: "POST" }), { params });

beforeEach(() => {
  h.member = { id: "member-1", email: "asha@example.com" };
  h.invoice = { ...INVOICE };
  h.booking = { id: "booking-1", status: "confirmed" };
  h.pendingPayment = null;
  h.razorpayConfigured = true;
  h.fetchedOrderStatus = "created";
  h.created = [];
  h.recorded = [];
});

afterEach(() => { vi.restoreAllMocks(); });

describe("access", () => {
  it("requires a signed-in member", async () => {
    h.member = null;
    expect((await post()).status).toBe(401);
    expect(h.created).toHaveLength(0);
  });

  it("answers 404 for an invoice that does not exist", async () => {
    h.invoice = null;
    expect((await post()).status).toBe(404);
  });

  it("answers 404 — not 403 — for somebody else's invoice", async () => {
    h.invoice = { ...INVOICE, memberId: "someone-else", customerEmail: "other@example.com" };
    const response = await post();
    expect(response.status).toBe(404);
    // Same body as a genuine miss, so the endpoint cannot be used to discover which ids exist.
    await expect(response.json()).resolves.toEqual({ error: "Invoice not found." });
    expect(h.created).toHaveLength(0);
  });

  it("accepts an invoice matched by member id", async () => {
    h.invoice = { ...INVOICE, memberId: "member-1", customerEmail: "elsewhere@example.com" };
    expect((await post()).status).toBe(200);
  });

  it("accepts an invoice matched by email, for one raised before the account existed", async () => {
    h.invoice = { ...INVOICE, memberId: null, customerEmail: "asha@example.com" };
    expect((await post()).status).toBe(200);
  });
});

describe("invoices that cannot be paid", () => {
  it.each([
    ["already paid", "paid", 409],
    ["refunded", "refunded", 409],
    ["void", "void", 409],
  ])("refuses one that is %s", async (_label, status, expected) => {
    h.invoice = { ...INVOICE, status };
    expect((await post()).status).toBe(expected);
    // No order minted, so no second charge is possible.
    expect(h.created).toHaveLength(0);
  });

  it("refuses when the consultation was cancelled", async () => {
    h.booking = { id: "booking-1", status: "cancelled" };
    expect((await post()).status).toBe(409);
    expect(h.created).toHaveLength(0);
  });

  it("refuses when the booking is gone", async () => {
    h.booking = null;
    expect((await post()).status).toBe(409);
  });

  it("reports 503 when online payments are not configured", async () => {
    h.razorpayConfigured = false;
    expect((await post()).status).toBe(503);
  });
});

describe("the double-payment guard", () => {
  it("reuses a fresh in-flight order instead of minting a second", async () => {
    h.pendingPayment = { providerSessionId: "order_existing", createdAt: new Date(Date.now() - 60_000) };
    const body = await (await post()).json();
    expect(body.orderId).toBe("order_existing");
    expect(h.created).toHaveLength(0);
  });

  it("reuses one Razorpay reports as merely attempted", async () => {
    h.pendingPayment = { providerSessionId: "order_existing", createdAt: new Date(Date.now() - 60_000) };
    h.fetchedOrderStatus = "attempted";
    const body = await (await post()).json();
    expect(body.orderId).toBe("order_existing");
    expect(h.created).toHaveLength(0);
  });

  it("mints a new order once the reuse window has passed", async () => {
    // Past 15 minutes the old order is assumed abandoned; holding it forever would strand a
    // customer who closed the modal.
    h.pendingPayment = { providerSessionId: "order_old", createdAt: new Date(Date.now() - 16 * 60_000) };
    const body = await (await post()).json();
    expect(body.orderId).toBe("order_new");
    expect(h.created).toHaveLength(1);
  });

  it("mints a new order when Razorpay has already moved the old one on", async () => {
    h.pendingPayment = { providerSessionId: "order_done", createdAt: new Date(Date.now() - 60_000) };
    h.fetchedOrderStatus = "paid";
    const body = await (await post()).json();
    expect(body.orderId).toBe("order_new");
  });

  it("mints a new order when there is no pending payment at all", async () => {
    const body = await (await post()).json();
    expect(body.orderId).toBe("order_new");
  });
});

describe("the order it creates", () => {
  it("takes the amount from the invoice, in paise", async () => {
    // Never from the request: the caller does not get to say what they owe.
    await post();
    expect(h.created[0]).toMatchObject({ amount: 150000, currency: "INR", receipt: "INV-2026-0001" });
  });

  it("rounds a fractional amount rather than truncating it", async () => {
    h.invoice = { ...INVOICE, amount: 1500.005 };
    await post();
    expect(h.created[0].amount).toBe(150001);
  });

  it("stamps the invoice and booking ids on the order for the webhook to find", async () => {
    await post();
    expect(h.created[0].notes).toEqual({ invoiceId: "inv-1", bookingId: "booking-1" });
  });

  it("records the pending payment so the next checkout can reuse it", async () => {
    await post();
    expect(h.recorded[0]).toMatchObject({ invoiceId: "inv-1", bookingId: "booking-1", amount: 1500, providerSessionId: "order_new" });
  });
});
