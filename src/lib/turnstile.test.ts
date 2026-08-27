import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "@/lib/turnstile";

/**
 * Guards the three-way configuration behaviour. The "neither key set" case is the one that
 * matters most: it previously failed closed in production and took member registration plus
 * three anonymous tools offline behind a CAPTCHA error no user could satisfy.
 */

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("verifyTurnstileToken", () => {
  it("allows the request when Turnstile is not deployed at all", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    // Stubbed rather than assigned: NODE_ENV is read-only in the type defs. The check no longer
    // consults it, and pinning it to production here is what proves that.
    vi.stubEnv("NODE_ENV", "production");
    // No widget renders without a site key, so no token can exist — the check must not block.
    expect(await verifyTurnstileToken(undefined, "1.2.3.4")).toBe(true);
  });

  it("fails closed when the widget is live but the secret is missing", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    expect(await verifyTurnstileToken("some-token", "1.2.3.4")).toBe(false);
  });

  it("rejects a missing token when the secret is configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    expect(await verifyTurnstileToken(undefined, "1.2.3.4")).toBe(false);
  });

  it("accepts a token Cloudflare confirms", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ success: true }) }));
    expect(await verifyTurnstileToken("good-token", "1.2.3.4")).toBe(true);
  });

  it("rejects a token Cloudflare denies, and fails closed if the call throws", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ success: false }) }));
    expect(await verifyTurnstileToken("bad-token", "1.2.3.4")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await verifyTurnstileToken("any-token", "1.2.3.4")).toBe(false);
  });
});
