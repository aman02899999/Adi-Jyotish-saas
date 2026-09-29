import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Crediting a wallet by hand moves real money to a member, so it takes the billing permission,
 * rejects anything malformed before touching a wallet, and is always audited.
 */

const h = vi.hoisted(() => ({
  admin: null as null | { id: string; name: string; permissions: string[] },
  credits: [] as Array<Record<string, unknown>>,
  audits: [] as Array<{ action: string; meta: Record<string, unknown> }>,
}));

vi.mock("@/lib/admin-auth", () => ({
  getCurrentAdmin: async () => h.admin,
  hasAdminPermission: (admin: { permissions: string[] }, permission: string) => admin.permissions.includes(permission),
  recordAudit: async (_admin: unknown, action: string, _type: string, _id: string, meta: Record<string, unknown>) => {
    h.audits.push({ action, meta });
  },
}));
vi.mock("@/lib/notifications", () => ({ createNotification: async () => undefined }));
vi.mock("@/lib/firestore", () => ({ db: {} }));
vi.mock("@/lib/wallet", () => ({
  creditWalletBonus: async (input: Record<string, unknown>) => {
    h.credits.push(input);
    return { id: input.memberId, memberId: input.memberId, currency: "INR", balance: input.amount };
  },
}));
vi.mock("@/lib/supabase-config", () => ({ isSupabaseCutoverActive: () => true }));
vi.mock("@/lib/postgres", () => ({
  query: async (_sql: string, params: unknown[]) => ({ rows: params[0] === "member-1" ? [{ name: "Asha", email: "asha@example.com" }] : [] }),
}));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/admin/wallets/credit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
}));
const valid = { memberId: "member-1", amount: 199, reason: "Refund for a failed palm reading", requestId: "3f1c2a9e-7b1d-4a55-9d0e-1a2b3c4d5e6f" };

beforeEach(() => {
  h.admin = { id: "admin-1", name: "Owner", permissions: ["billing"] };
  h.credits = [];
  h.audits = [];
});

describe("POST /api/admin/wallets/credit", () => {
  it("refuses a signed-out caller", async () => {
    h.admin = null;
    expect((await post(valid)).status).toBe(401);
    expect(h.credits).toHaveLength(0);
  });

  it("refuses an admin without the billing permission", async () => {
    h.admin = { id: "admin-2", name: "Scheduler", permissions: ["schedule"] };
    expect((await post(valid)).status).toBe(403);
    expect(h.credits).toHaveLength(0);
  });

  it("credits the wallet once per request id and audits it", async () => {
    const response = await post(valid);
    expect(response.status).toBe(200);
    expect(h.credits).toEqual([{ memberId: "member-1", amount: 199, type: "admin_credit", referenceType: "admin_credit", referenceId: `admin-credit-${valid.requestId}` }]);
    expect(h.audits).toEqual([{ action: "wallet.credited", meta: { amount: 199, reason: valid.reason, requestId: valid.requestId } }]);
  });

  it("refuses a member that does not exist, without opening a wallet", async () => {
    expect((await post({ ...valid, memberId: "ghost" })).status).toBe(400);
    expect(h.credits).toHaveLength(0);
  });

  it.each([
    ["a zero amount", { amount: 0 }],
    ["a negative amount", { amount: -50 }],
    ["a fractional amount", { amount: 10.5 }],
    ["an amount over the limit", { amount: 50001 }],
    ["an amount sent as text", { amount: "199" }],
    ["a missing reason", { reason: "" }],
    ["a missing member", { memberId: "" }],
    ["a malformed request id", { requestId: "x" }],
  ])("rejects %s", async (_label, change) => {
    expect((await post({ ...valid, ...change })).status).toBe(400);
    expect(h.credits).toHaveLength(0);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await POST(new Request("http://localhost/api/admin/wallets/credit", { method: "POST", body: "not json" }));
    expect(response.status).toBe(400);
  });
});
