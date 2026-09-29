import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every AI reading is paid for before it is generated. Without GEMINI_API_KEY the payment would
 * succeed and the reading would fail, so the routes that take payment must refuse first, and must
 * not create a reading or charge the wallet while the key is missing.
 */

const calls = vi.hoisted(() => ({ created: 0, walletQuoted: 0, bypassed: 0, usageToday: 0 }));
// Today's Gemini call count, as the guard reads it on the Firestore path.
vi.mock("@/lib/firestore", () => ({
  db: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ count: calls.usageToday }) }) }) }) },
}));
// ...and on the Postgres path, so the suite means the same thing whichever provider it runs under.
vi.mock("@/lib/gemini-usage-supabase", () => ({
  getGeminiUsageInSupabase: async () => calls.usageToday,
  claimGeminiCallInSupabase: async () => true,
  releaseGeminiCallInSupabase: async () => undefined,
}));
vi.mock("@/lib/member-auth", () => ({ getCurrentMember: async () => ({ id: "m1", email: "m1@example.test" }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, retryAfter: 0 }), rateLimitResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/payment-bypass", () => ({ memberBypassesPayment: () => false }));
vi.mock("@/lib/razorpay", () => ({ getRazorpay: () => null, getRazorpayKeyId: () => null }));
vi.mock("@/lib/wallet", () => ({ quoteWalletPayment: async () => { calls.walletQuoted += 1; return { sufficient: false, balance: 0, shortfall: 1 }; } }));
vi.mock("@/lib/ai-readings", () => ({
  AI_READING_CURRENCY: "INR",
  AI_TAROT_READING_PRICE: 199,
  attachRazorpayOrder: async () => {},
  createPendingTarotReading: async () => { calls.created += 1; return { id: "r1", price: 199, currency: "INR" }; },
  generateReadingAnswer: async (r: unknown) => r,
  markReadingPaidWithoutCharge: async () => { calls.bypassed += 1; return null; },
  payReadingFromWallet: async () => null,
}));

const { POST: createTarot } = await import("@/app/api/ai-readings/tarot/route");
const { settleReadingFromWallet } = await import("@/lib/reading-checkout");

const tarotRequest = () => new Request("http://localhost/api/ai-readings/tarot", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ clientName: "Test", question: "What does this month hold for me?" }),
});
const member = { id: "m1", email: "m1@example.test" } as never;
const reading = (readingType: string) => ({ id: "r1", readingType, price: 199 }) as never;

describe("AI readings without a Gemini key", () => {
  beforeEach(() => { calls.created = 0; calls.walletQuoted = 0; calls.bypassed = 0; calls.usageToday = 0; });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses to create a paid AI reading, before anything is created", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await createTarot(tarotRequest());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("not been charged") });
    expect(calls.created).toBe(0);
  });

  it("refuses to settle an AI reading from the wallet, before the wallet is touched", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await settleReadingFromWallet(member, reading("tarot"));
    expect(response.status).toBe(503);
    expect(calls.walletQuoted).toBe(0);
  });

  it("still settles Kundli and Varshphal, which need no AI", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    for (const type of ["kundli", "varshphal"]) {
      const response = await settleReadingFromWallet(member, reading(type));
      expect(response.status).not.toBe(503);
    }
    expect(calls.walletQuoted).toBe(2);
  });

  it("lets the purchase through once the key is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "set");
    expect((await createTarot(tarotRequest())).status).not.toBe(503);
    expect(calls.created).toBe(1);
  });

  it("refuses a new paid reading once today's call cap is used up", async () => {
    vi.stubEnv("GEMINI_API_KEY", "set");
    calls.usageToday = 200;
    const response = await createTarot(tarotRequest());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("not been charged") });
    expect(calls.created).toBe(0);
  });

  it("refuses to settle from the wallet once today's cap is used up, before the wallet is touched", async () => {
    vi.stubEnv("GEMINI_API_KEY", "set");
    calls.usageToday = 200;
    expect((await settleReadingFromWallet(member, reading("tarot"))).status).toBe(503);
    expect(calls.walletQuoted).toBe(0);
  });

  it("still sells readings while calls remain today", async () => {
    vi.stubEnv("GEMINI_API_KEY", "set");
    calls.usageToday = 199;
    expect((await createTarot(tarotRequest())).status).not.toBe(503);
    expect(calls.created).toBe(1);
  });
});
