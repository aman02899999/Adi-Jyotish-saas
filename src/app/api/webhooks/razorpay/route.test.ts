import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, createHash } from "node:crypto";

/**
 * The route's own control flow, which the lib-level suite does not reach.
 *
 * This is the only unauthenticated entry point in the application that moves money, and its two
 * boundaries both fail silently when they break. The signature check is what stops anyone who
 * knows an order id from marking invoices paid. The dedup claim is what stops one delivery being
 * processed twice — and, in the other direction, what stops a *failed* delivery from being
 * swallowed: the claim is written before the handler runs, so if it is not removed when the
 * handler throws, Razorpay's retry of that same event is deduped away as "already processed" and
 * a real payment is lost with a 200 in the log and nothing else.
 *
 * Signature verification here is the real HMAC from @/lib/razorpay, not a mock, so these tests
 * would catch the check being weakened rather than merely being called.
 */

const SECRET = "whsec_test_value";

// vi.mock factories are hoisted above the module body, so everything they close over has to be
// hoisted with them.
const h = vi.hoisted(() => {
  type Call = { collection: string; id?: string; op: string };
  const calls: Call[] = [];
  /** Set to make the payments lookup throw, standing in for any handler-side failure. */
  const state = { paymentsLookupFails: false };
  /** Ids whose `create` should report "already exists" (Firestore code 6). */
  const existingEventIds = new Set<string>();

  function makeCollection(name: string) {
    const query = {
      where: () => query,
      limit: () => query,
      async get() {
        calls.push({ collection: name, op: "query" });
        if (name === "payments" && state.paymentsLookupFails) throw new Error("payments lookup exploded");
        return { empty: true, docs: [] };
      },
    };
    const doc = (id: string) => ({
      id,
      async create(data: unknown) {
        calls.push({ collection: name, id, op: "create" });
        void data;
        if (existingEventIds.has(id)) throw Object.assign(new Error("already exists"), { code: 6 });
        existingEventIds.add(id);
      },
      async delete() {
        calls.push({ collection: name, id, op: "delete" });
        existingEventIds.delete(id);
      },
      async get() {
        calls.push({ collection: name, id, op: "get" });
        return { exists: false, data: () => undefined };
      },
      async update() {
        calls.push({ collection: name, id, op: "update" });
      },
      collection: () => makeCollection(`${name}/${id}`),
    });
    return { doc, ...query };
  }

  return { calls, state, existingEventIds, makeCollection };
});

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "ts", delete: () => "del" },
}));

vi.mock("@/lib/firestore", () => ({
  db: { collection: (name: string) => h.makeCollection(name), runTransaction: async () => {} },
}));

// Leaf modules the route imports; none should be reached by these tests, and a call would be a
// finding rather than a pass.
vi.mock("@/lib/billing", () => ({ invoiceFromSnap: () => ({}), paymentFromSnap: () => ({}) }));
vi.mock("@/lib/plans", () => ({ getPlanById: async () => null }));
vi.mock("@/lib/gst", () => ({ splitGstInclusive: () => ({ subtotal: 0, taxAmount: 0 }) }));
vi.mock("@/lib/messaging", () => ({ sendBookingNotification: async () => {} }));
vi.mock("@/lib/email", () => ({ sendEmail: async () => {}, genericNotificationEmailHtml: () => "" }));
vi.mock("@/lib/notifications", () => ({ createNotification: async () => {}, notifyAdmins: async () => {} }));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: () => "https://example.test" }));
vi.mock("@/lib/referrals", () => ({ processReferralReward: async () => {} }));
vi.mock("@/lib/studio-settings", () => ({ getStudioSettings: async () => ({ gstRate: 18, currency: "INR" }) }));
vi.mock("@/lib/wallet", () => ({ rechargeWallet: async () => {} }));
vi.mock("@/lib/admin-roles", () => ({ getAdminIdsWithPermission: async () => [] }));
vi.mock("@/lib/billing-supabase", () => ({
  completeInvoiceRefundInSupabase: async () => {},
  confirmInvoicePaymentInSupabase: async () => {},
  getInvoiceByIdInSupabase: async () => null,
}));
vi.mock("@/lib/razorpay-webhook-supabase", () => ({
  applySubscriptionChargeInSupabase: async () => {},
  applySubscriptionStatusInSupabase: async () => {},
  bumpPaymentFailureCounterInSupabase: async () => 0,
  claimRazorpayEventInSupabase: async () => true,
  findSubscriptionByRazorpayIdInSupabase: async () => null,
  getDunningStateInSupabase: async () => null,
  getMemberContactInSupabase: async () => null,
  getPaymentByOrderIdInSupabase: async () => null,
  getRefundablePaymentInSupabase: async () => null,
  insertSubscriptionInvoiceIfAbsentInSupabase: async () => {},
  markDunningNoticeSentInSupabase: async () => {},
  markPaymentFailedInSupabase: async () => {},
  releaseRazorpayEventInSupabase: async () => {},
  syncMemberPlanLabelInSupabase: async () => {},
}));

import { POST } from "./route";

function sign(body: string) {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

function post(body: string, headers: Record<string, string> = {}) {
  return POST(new Request("https://example.test/api/webhooks/razorpay", { method: "POST", body, headers }));
}

/** A correctly signed delivery. */
function signed(body: string, eventId = "evt_default") {
  return post(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": eventId });
}

const calls = h.calls;
const claims = () => calls.filter((c) => c.collection === "razorpayEvents");

beforeEach(() => {
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("SUPABASE_CUTOVER", "false");
  calls.length = 0;
  h.existingEventIds.clear();
  h.state.paymentsLookupFails = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuration gate", () => {
  it("refuses with 503 when no webhook secret is set", async () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    const response = await post(JSON.stringify({ event: "payment.captured" }));
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});

describe("signature verification", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: {} });

  it("rejects a delivery with no signature header", async () => {
    const response = await post(body);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("signature") });
  });

  it("rejects a forged signature", async () => {
    const response = await post(body, { "x-razorpay-signature": "deadbeef" });
    expect(response.status).toBe(400);
  });

  it("rejects a signature computed over a different body", async () => {
    // The attack this stops: replaying a genuine signature against altered contents.
    const response = await post(body, { "x-razorpay-signature": sign(JSON.stringify({ event: "other" })) });
    expect(response.status).toBe(400);
  });

  it("writes nothing at all when the signature fails", async () => {
    await post(body, { "x-razorpay-signature": "deadbeef" });
    // No dedup claim, no queries. A rejected delivery must leave no trace to replay against.
    expect(calls).toHaveLength(0);
  });

  it("accepts a correctly signed delivery", async () => {
    const response = await signed(body, "evt_ok");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

describe("payload parsing", () => {
  it("rejects malformed JSON, but only after the signature has passed", async () => {
    const raw = "{not json";
    const response = await post(raw, { "x-razorpay-signature": sign(raw) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Malformed") });
    // Parsing failure must not leave a claim behind, or the corrected retry would be deduped.
    expect(claims()).toHaveLength(0);
  });
});

describe("idempotency", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: {} });

  it("claims the event on first delivery", async () => {
    await signed(body, "evt_1");
    expect(claims().filter((c) => c.op === "create").map((c) => c.id)).toEqual(["evt_1"]);
  });

  it("dedupes a repeat delivery of the same event id", async () => {
    await signed(body, "evt_2");
    calls.length = 0;
    const response = await signed(body, "evt_2");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deduped: true });
  });

  it("keys on the event id, so two distinct events both process", async () => {
    await signed(body, "evt_a");
    const response = await signed(body, "evt_b");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("falls back to a hash of the body when the event-id header is absent", async () => {
    // Deterministic on purpose: a timestamp here would defeat dedup by construction, so a
    // genuine retry of the same delivery must still collide.
    const response = await post(body, { "x-razorpay-signature": sign(body) });
    expect(response.status).toBe(200);
    expect(claims().filter((c) => c.op === "create").map((c) => c.id))
      .toEqual([createHash("sha256").update(body).digest("hex")]);
  });

  it("dedupes a headerless retry of the identical body", async () => {
    await post(body, { "x-razorpay-signature": sign(body) });
    const response = await post(body, { "x-razorpay-signature": sign(body) });
    await expect(response.json()).resolves.toEqual({ ok: true, deduped: true });
  });
});

describe("claim release on failure", () => {
  // The money-safety property. The claim is written before the handler runs, so a handler that
  // throws must hand it back — otherwise Razorpay's retry of a payment that never processed is
  // silently discarded as a duplicate.
  const body = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_1", order_id: "order_1", status: "captured" } } },
  });

  it("returns 500 and releases the claim when the handler throws", async () => {
    h.state.paymentsLookupFails = true;
    const response = await signed(body, "evt_fail");
    expect(response.status).toBe(500);

    const events = claims();
    expect(events.map((c) => c.op)).toEqual(["create", "delete"]);
    expect(events.every((c) => c.id === "evt_fail")).toBe(true);
  });

  it("lets the retry through after a failed delivery", async () => {
    h.state.paymentsLookupFails = true;
    await signed(body, "evt_retry");

    // Razorpay retries; this time the handler succeeds. A retained claim would answer
    // {deduped:true} here and the payment would never be recorded.
    h.state.paymentsLookupFails = false;
    calls.length = 0;
    const response = await signed(body, "evt_retry");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("keeps the claim when the handler succeeds", async () => {
    const response = await signed(body, "evt_ok2");
    expect(response.status).toBe(200);
    expect(claims().map((c) => c.op)).toEqual(["create"]);
  });
});

describe("event dispatch", () => {
  it("accepts an unrecognised event without dispatching anything", async () => {
    const body = JSON.stringify({ event: "payment.authorized", payload: {} });
    const response = await signed(body, "evt_unknown");
    expect(response.status).toBe(200);
    // Claimed (so a retry dedupes) but no handler ran.
    expect(calls.filter((c) => c.collection !== "razorpayEvents")).toHaveLength(0);
  });

  it("tolerates a known event whose entity is missing", async () => {
    // Razorpay has shipped payloads without the entity before; a 500 here would have it retry
    // forever against an event that can never succeed.
    const body = JSON.stringify({ event: "refund.processed", payload: {} });
    const response = await signed(body, "evt_noentity");
    expect(response.status).toBe(200);
  });
});
