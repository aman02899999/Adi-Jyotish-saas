import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The gates in front of an irreversible deletion.
 *
 * Every test here asserts the same underlying property from a different angle: deleteMemberAccount
 * must not be reached unless the caller is signed in, is under the throttle, typed the phrase
 * exactly, and — when 2FA is on — produced a live code. A route that deletes one gate too early
 * still returns 200 and still looks correct in the browser; the account is simply gone when it
 * should not be.
 *
 * DELETE_CONFIRMATION_PHRASE is imported for real rather than mocked, so a change to it cannot
 * quietly desynchronise the route from the UI that prompts for it.
 */

const h = vi.hoisted(() => ({
  member: null as { id: string; email: string; totpEnabled: boolean } | null,
  throttle: { allowed: true, retryAfter: 0, keyHash: "hash-1" },
  totpState: { totpSecret: "SECRET" } as { totpSecret: string | null } | null,
  totpValid: false,
  deleteError: null as Error | null,
  blockers: [] as string[],
  blockersError: null as Error | null,
  calls: [] as string[],
}));

vi.mock("@/lib/member-auth", () => ({
  getCurrentMember: async () => h.member,
  revokeMemberSession: async () => { h.calls.push("revokeSession"); },
}));
vi.mock("@/lib/auth-throttle", () => ({
  checkAuthThrottle: async () => h.throttle,
  recordAuthFailure: async () => { h.calls.push("recordFailure"); },
  clearAuthFailures: async () => { h.calls.push("clearFailures"); },
}));
vi.mock("@/lib/two-factor", () => ({
  getTwoFactorState: async () => h.totpState,
  verifyTotpOrBackupCode: async () => h.totpValid,
}));
vi.mock("@/lib/account-deletion", async () => {
  class AccountDeletionBlockedError extends Error {}
  class AccountDeletionUnavailableError extends Error {}
  return {
    AccountDeletionBlockedError,
    AccountDeletionUnavailableError,
    deleteMemberAccount: async (member: { id: string }) => {
      h.calls.push(`delete:${member.id}`);
      if (h.deleteError) throw h.deleteError;
    },
    getDeletionBlockers: async () => {
      h.calls.push("blockers");
      if (h.blockersError) throw h.blockersError;
      return h.blockers;
    },
  };
});

import { DELETE_CONFIRMATION_PHRASE } from "@/lib/account-privacy";
import { AccountDeletionBlockedError, AccountDeletionUnavailableError } from "@/lib/account-deletion";
import { GET, POST } from "./route";

const MEMBER = { id: "member-1", email: "asha@example.com", totpEnabled: false };

function post(body: unknown) {
  return POST(new Request("https://example.test/api/member/delete-account", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }));
}

/** Did the route actually reach the irreversible part? */
const deleted = () => h.calls.some((c) => c.startsWith("delete:"));

beforeEach(() => {
  h.member = { ...MEMBER };
  h.throttle = { allowed: true, retryAfter: 0, keyHash: "hash-1" };
  h.totpState = { totpSecret: "SECRET" };
  h.totpValid = false;
  h.deleteError = null;
  h.blockers = [];
  h.blockersError = null;
  h.calls = [];
});

afterEach(() => { vi.restoreAllMocks(); });

describe("GET pre-flight", () => {
  it("requires a signed-in member", async () => {
    h.member = null;
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("reports the blockers, the 2FA requirement and the exact phrase the UI must ask for", async () => {
    h.member = { ...MEMBER, totpEnabled: true };
    h.blockers = ["Your wallet still holds ₹250."];
    const body = await (await GET()).json();
    expect(body).toEqual({
      blockers: ["Your wallet still holds ₹250."],
      twoFactorRequired: true,
      confirmationPhrase: DELETE_CONFIRMATION_PHRASE,
    });
  });

  it("surfaces an unavailable provider as 503 rather than a 500", async () => {
    h.blockersError = new AccountDeletionUnavailableError("migrating");
    const response = await GET();
    expect(response.status).toBe(503);
  });
});

describe("gates before deletion", () => {
  it("refuses an unauthenticated caller", async () => {
    h.member = null;
    const response = await post({ confirmation: DELETE_CONFIRMATION_PHRASE });
    expect(response.status).toBe(401);
    expect(deleted()).toBe(false);
  });

  it("refuses while throttled, and says when to come back", async () => {
    h.throttle = { allowed: false, retryAfter: 42, keyHash: "hash-1" };
    const response = await post({ confirmation: DELETE_CONFIRMATION_PHRASE });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(deleted()).toBe(false);
  });

  it("refuses without the confirmation phrase", async () => {
    const response = await post({});
    expect(response.status).toBe(400);
    expect(deleted()).toBe(false);
  });

  it.each([
    ["the wrong words", "delete my account"],
    ["the wrong case", DELETE_CONFIRMATION_PHRASE.toLowerCase()],
    ["an empty string", ""],
    ["a near miss", `${DELETE_CONFIRMATION_PHRASE}!`],
  ])("refuses %s", async (_label, confirmation) => {
    const response = await post({ confirmation });
    expect(response.status).toBe(400);
    expect(deleted()).toBe(false);
  });

  it("accepts the phrase with surrounding whitespace, which a paste or a keyboard adds", async () => {
    const response = await post({ confirmation: `  ${DELETE_CONFIRMATION_PHRASE} ` });
    expect(response.status).toBe(200);
    expect(deleted()).toBe(true);
  });

  it("survives a body that is not JSON at all", async () => {
    const response = await POST(new Request("https://example.test/api/member/delete-account", {
      method: "POST", body: "not json",
    }));
    expect(response.status).toBe(400);
    expect(deleted()).toBe(false);
  });
});

describe("two-factor re-authentication", () => {
  beforeEach(() => { h.member = { ...MEMBER, totpEnabled: true }; });

  it("refuses when no code is supplied", async () => {
    const response = await post({ confirmation: DELETE_CONFIRMATION_PHRASE });
    expect(response.status).toBe(401);
    expect(deleted()).toBe(false);
  });

  it("refuses an incorrect code and records the failure against the throttle", async () => {
    h.totpValid = false;
    const response = await post({ confirmation: DELETE_CONFIRMATION_PHRASE, code: "000000" });
    expect(response.status).toBe(401);
    expect(deleted()).toBe(false);
    // Without this, the code could be brute-forced without ever tripping the throttle.
    expect(h.calls).toContain("recordFailure");
  });

  it("fails closed when 2FA is on but no secret is stored", async () => {
    // A missing secret is a broken account, not a free pass — the enabled flag is what the
    // member sees, so the safe reading is "cannot re-authenticate", never "no check needed".
    h.totpState = { totpSecret: null };
    h.totpValid = true;
    const response = await post({ confirmation: DELETE_CONFIRMATION_PHRASE, code: "123456" });
    expect(response.status).toBe(401);
    expect(deleted()).toBe(false);
  });

  it("fails closed when the account has no two-factor record at all", async () => {
    h.totpState = null;
    h.totpValid = true;
    const response = await post({ confirmation: DELETE_CONFIRMATION_PHRASE, code: "123456" });
    expect(response.status).toBe(401);
    expect(deleted()).toBe(false);
  });

  it("proceeds on a valid code", async () => {
    h.totpValid = true;
    const response = await post({ confirmation: DELETE_CONFIRMATION_PHRASE, code: "123456" });
    expect(response.status).toBe(200);
    expect(deleted()).toBe(true);
  });

  it("asks for no code at all when 2FA is off", async () => {
    h.member = { ...MEMBER, totpEnabled: false };
    h.totpValid = false;
    const response = await post({ confirmation: DELETE_CONFIRMATION_PHRASE });
    expect(response.status).toBe(200);
    expect(deleted()).toBe(true);
  });
});

describe("deletion outcomes", () => {
  it("deletes the signed-in member and ignores any id in the body", async () => {
    // There is no id parameter by design; this pins that adding one could not retarget the
    // deletion at someone else's account.
    await post({ confirmation: DELETE_CONFIRMATION_PHRASE, id: "someone-else", memberId: "someone-else" });
    expect(h.calls).toContain("delete:member-1");
    expect(h.calls.filter((c) => c.startsWith("delete:"))).toHaveLength(1);
  });

  it("clears the throttle failures and revokes the session on success", async () => {
    const response = await post({ confirmation: DELETE_CONFIRMATION_PHRASE });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(h.calls).toContain("clearFailures");
    // The Auth user is gone; a live cookie would keep presenting a dead credential.
    expect(h.calls).toContain("revokeSession");
  });

  it("reports a blocked deletion as 409 and leaves the session alone", async () => {
    h.deleteError = new AccountDeletionBlockedError("Your wallet still holds ₹250.");
    const response = await post({ confirmation: DELETE_CONFIRMATION_PHRASE });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("wallet") });
    // Nothing was deleted, so signing the member out would be wrong.
    expect(h.calls).not.toContain("revokeSession");
  });

  it("reports an unavailable provider as 503 and leaves the session alone", async () => {
    h.deleteError = new AccountDeletionUnavailableError("migrating");
    const response = await post({ confirmation: DELETE_CONFIRMATION_PHRASE });
    expect(response.status).toBe(503);
    expect(h.calls).not.toContain("revokeSession");
  });

  it("lets an unexpected failure surface instead of reporting success", async () => {
    h.deleteError = new Error("postgres exploded");
    await expect(post({ confirmation: DELETE_CONFIRMATION_PHRASE })).rejects.toThrow("postgres exploded");
    expect(h.calls).not.toContain("revokeSession");
  });
});
