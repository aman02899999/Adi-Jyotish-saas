import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * This check is the thing an operator trusts when they have just pasted a key into their hosting
 * provider and want to know whether readings will work. A false "Working." is worse than no check
 * at all — it sends them away satisfied while every paying member still gets a reading that never
 * finishes — so each verdict is pinned here against the shape Gemini actually returns.
 */

// gemini.ts reaches Firestore for the daily usage counter; the health check must not depend on it.
vi.mock("@/lib/firestore", () => ({
  db: {
    collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ count: 7 }) }) }) }),
  },
}));

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_DAILY_CALL_LIMIT = "2000";
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function loadCheck() {
  const { checkGeminiHealth } = await import("@/lib/gemini");
  return checkGeminiHealth;
}

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const spy = vi.fn(impl as never);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function geminiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("checkGeminiHealth", () => {
  it("reports the key as missing without making a network call", async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchSpy = stubFetch(() => geminiResponse({}));
    const result = await (await loadCheck())();
    expect(result.status).toBe("unconfigured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports success and today's usage when the model answers", async () => {
    stubFetch(() => geminiResponse({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }));
    const result = await (await loadCheck())();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.usageToday).toBe(7);
    expect(result.dailyLimit).toBe(2000);
    expect(result.model).toBe("gemini-3.6-flash");
  });

  it("surfaces the HTTP status and body when the key is rejected", async () => {
    stubFetch(() => new Response("API key not valid. Please pass a valid API key.", { status: 400 }));
    const result = await (await loadCheck())();
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.httpStatus).toBe(400);
    expect(result.detail).toContain("API key not valid");
  });

  it("treats a 200 with no candidates as a failure, not a pass", async () => {
    // A safety block or an exhausted token budget returns 200 with nothing usable in it. Reporting
    // that as healthy is the exact false negative this check exists to prevent.
    stubFetch(() => geminiResponse({ candidates: [] }));
    const result = await (await loadCheck())();
    expect(result.status).toBe("error");
  });

  it("reports a network failure rather than throwing into the admin page", async () => {
    stubFetch(() => { throw new Error("getaddrinfo ENOTFOUND generativelanguage.googleapis.com"); });
    const result = await (await loadCheck())();
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.httpStatus).toBeNull();
    expect(result.detail).toContain("ENOTFOUND");
  });

  it("does not spend a reading from the daily budget", async () => {
    // The counter is only ever read here. If this check started claiming budget, an operator
    // testing their configuration would eat into the allowance real members are paying for.
    const fetchSpy = stubFetch(() => geminiResponse({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }));
    await (await loadCheck())();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    // Small enough that the check costs essentially nothing against the account's quota.
    expect(body.generationConfig.maxOutputTokens).toBeLessThanOrEqual(16);
  });

  it("sends no deprecated sampling parameters", async () => {
    const fetchSpy = stubFetch(() => geminiResponse({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }));
    await (await loadCheck())();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig).not.toHaveProperty("temperature");
    expect(body.generationConfig).not.toHaveProperty("topP");
    expect(body.generationConfig).not.toHaveProperty("topK");
  });
});

describe("readGeminiErrorMessage, via checkGeminiHealth", () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = "test-key"; });

  it("pulls the human-readable line out of Google's error envelope", async () => {
    // The raw body is a nest of type URLs and metadata; truncating it cuts the actual reason off
    // mid-object and leaves the admin nothing to act on.
    const envelope = JSON.stringify({
      error: {
        code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID", domain: "googleapis.com" }],
      },
    });
    stubFetch(() => new Response(envelope, { status: 400 }));
    const result = await (await loadCheck())();
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.detail).toBe("API key not valid. Please pass a valid API key.");
  });

  it("falls back to the raw body when the error is not JSON", async () => {
    stubFetch(() => new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 }));
    const result = await (await loadCheck())();
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.detail).toContain("502 Bad Gateway");
  });
});
