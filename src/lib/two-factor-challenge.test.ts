import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A 2FA sign-in is two requests: login mints a challenge, verify-2fa redeems it. On serverless
 * hosting those can run on different instances, so the challenge must open anywhere the
 * deployment's secret is set, and nowhere else. Each test re-imports the module to stand in for a
 * fresh instance with nothing in memory.
 */
vi.mock("@/lib/firestore", () => ({ db: {} }));

const SECRET = "a-deployment-wide-session-signing-secret";
const freshInstance = async () => {
  vi.resetModules();
  return import("@/lib/two-factor");
};

describe("2FA challenge tokens", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("open on another instance of the same deployment", async () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", SECRET);
    const token = (await freshInstance()).createTwoFactorChallenge("admin", "uid-1", "id-token-1");
    const other = await freshInstance();
    expect(other.peekTwoFactorChallenge("admin", token)).toEqual({ uid: "uid-1", idToken: "id-token-1" });
  });

  it("derive the key from the Firebase credential when the Supabase secret is absent", async () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", "");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_KEY", '{"private_key":"k"}');
    const token = (await freshInstance()).createTwoFactorChallenge("member", "uid-2", "id-token-2");
    expect((await freshInstance()).peekTwoFactorChallenge("member", token)?.uid).toBe("uid-2");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_KEY", '{"private_key":"other"}');
    expect((await freshInstance()).peekTwoFactorChallenge("member", token)).toBeNull();
  });

  it("refuse another portal, a tampered token, a foreign key and a malformed token", async () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", SECRET);
    const twoFactor = await freshInstance();
    const token = twoFactor.createTwoFactorChallenge("member", "uid-3", "id-token-3");
    expect(twoFactor.peekTwoFactorChallenge("admin", token)).toBeNull();
    expect(twoFactor.peekTwoFactorChallenge("practitioner", token)).toBeNull();

    const [iv, tag, sealed] = token.split(".");
    const flipped = Buffer.from(sealed, "base64url");
    flipped[0] ^= 1;
    expect(twoFactor.peekTwoFactorChallenge("member", [iv, tag, flipped.toString("base64url")].join("."))).toBeNull();
    expect(twoFactor.peekTwoFactorChallenge("member", "not-a-token")).toBeNull();
    expect(twoFactor.peekTwoFactorChallenge("member", "a.b.c")).toBeNull();

    vi.stubEnv("SUPABASE_JWT_SECRET", `${SECRET}-rotated`);
    expect((await freshInstance()).peekTwoFactorChallenge("member", token)).toBeNull();
  });

  it("expire after five minutes", async () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", SECRET);
    vi.useFakeTimers({ now: new Date("2031-01-01T00:00:00Z") });
    const twoFactor = await freshInstance();
    const token = twoFactor.createTwoFactorChallenge("member", "uid-4", "id-token-4");
    vi.setSystemTime(new Date("2031-01-01T00:04:59Z"));
    expect(twoFactor.peekTwoFactorChallenge("member", token)?.uid).toBe("uid-4");
    vi.setSystemTime(new Date("2031-01-01T00:05:01Z"));
    expect(twoFactor.peekTwoFactorChallenge("member", token)).toBeNull();
  });

  it("do not carry the ID token in readable form", async () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", SECRET);
    const token = (await freshInstance()).createTwoFactorChallenge("member", "uid-5", "secret-id-token");
    const decoded = token.split(".").map((part) => Buffer.from(part, "base64url").toString("latin1")).join("");
    expect(decoded).not.toContain("secret-id-token");
    expect(decoded).not.toContain("uid-5");
  });
});
