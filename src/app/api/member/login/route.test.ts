import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A database outage during sign-in used to be answered "Email or password is incorrect" and
 * counted as a failed attempt: people with the right password were told it was wrong, then locked
 * out. An outage is now a 503 that counts against nobody; a genuinely refused session still is 401.
 */
const createMemberSession = vi.fn();
const recordAuthFailure = vi.fn();
const checkTwoFactorGate = vi.fn(async (): Promise<string | null> => null);
vi.mock("@/lib/member-auth", () => ({ createMemberSession, getCurrentMember: async () => ({ id: "m1", onboardingComplete: true }) }));
vi.mock("@/lib/auth-verify", () => ({ verifyAuthToken: async () => ({ uid: "uid-1" }) }));
vi.mock("@/lib/two-factor", () => ({ checkTwoFactorGate }));
vi.mock("@/lib/auth-throttle", () => ({
  checkAuthThrottle: async () => ({ allowed: true, retryAfter: 0, keyHash: "k" }),
  clearAuthFailures: vi.fn(),
  recordAuthFailure,
}));

const { POST } = await import("./route");
let ip = 0;
const signIn = () => POST(new Request("http://localhost/api/member/login", { method: "POST", headers: { "x-forwarded-for": `10.1.0.${++ip}` }, body: JSON.stringify({ idToken: "token" }) }));
const quota = () => Object.assign(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."), { code: 8 });

describe("POST /api/member/login during a database outage", () => {
  beforeEach(() => { recordAuthFailure.mockClear(); vi.spyOn(console, "error").mockImplementation(() => {}); });

  it("answers 503, not a wrong password, and does not count a failed attempt", async () => {
    createMemberSession.mockImplementation(async () => { throw quota(); });
    const response = await signIn();
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("temporarily unavailable");
    expect(recordAuthFailure).not.toHaveBeenCalled();
  });

  it("answers 503 when the two-factor check cannot read the database", async () => {
    checkTwoFactorGate.mockImplementationOnce(async () => { throw quota(); });
    expect((await signIn()).status).toBe(503);
  });

  it("still refuses a session the database rejects, and counts it", async () => {
    createMemberSession.mockImplementation(async () => { throw new Error("no such member"); });
    const response = await signIn();
    expect(response.status).toBe(401);
    expect(recordAuthFailure).toHaveBeenCalledTimes(1);
  });
});
