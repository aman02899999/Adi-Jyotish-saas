import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * First-run bootstrap: the one route that creates an owner administrator with every permission,
 * from an unauthenticated request. It is safe only because of a single condition —
 * `getAdminCount() > 0` — and if that ever stops holding on a live workspace, anyone who can
 * reach the URL can mint themselves an owner.
 *
 * The other half of these tests is where the new admin's identity comes from. Both the uid and
 * the email are taken from the *verified* token and never from the request body; a route that
 * trusted either would let a caller create an owner for somebody else's account, or under an
 * address they do not control. The role is likewise fixed, not chosen.
 */

const h = vi.hoisted(() => ({
  adminCount: 0,
  verify: null as null | ((token: string) => Promise<{ uid: string; email?: string }>),
  created: [] as Array<Record<string, unknown>>,
  roles: [] as Array<{ key: string; name: string; permissions: string[] }>,
  sessions: [] as string[],
  audits: [] as string[],
  PERMISSIONS: [{ key: "members_manage" }, { key: "billing" }, { key: "roles" }],
}));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "ts" } }));
vi.mock("@/lib/firestore", () => ({
  db: {
    collection: (collection: string) => ({
      doc: (id: string) => ({
        async set(data: Record<string, unknown>) {
          if (collection === "adminUsers") h.created.push({ id, ...data });
          else h.roles.push({ key: id, name: String(data.name), permissions: data.permissions as string[] });
        },
      }),
    }),
  },
}));
vi.mock("@/lib/admin-auth", () => ({
  ALL_ADMIN_PERMISSIONS: h.PERMISSIONS,
  getAdminCount: async () => h.adminCount,
  createAdminSession: async (token: string) => { h.sessions.push(token); },
  getCurrentAdmin: async () => (h.created.length ? { id: h.created[0].id, role: h.created[0].role } : null),
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  recordAudit: async (_a: unknown, action: string) => { h.audits.push(action); },
}));
vi.mock("@/lib/auth-verify", () => ({
  verifyAuthToken: async (token: string) => {
    if (!h.verify) throw new Error("no verifier");
    return h.verify(token);
  },
}));
vi.mock("@/lib/admin-auth-supabase", () => ({
  createAdminInSupabase: async (row: Record<string, unknown>) => { h.created.push(row); },
}));
vi.mock("@/lib/admin-roles-supabase", () => ({
  upsertSystemRoleInSupabase: async (key: string, name: string, permissions: string[]) => {
    h.roles.push({ key, name, permissions });
  },
}));

import { POST } from "./route";

const GOOD_TOKEN = "token-for-uid-1";

function post(body: unknown) {
  return POST(new Request("https://example.test/api/auth/setup", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }));
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_CUTOVER", "false");
  h.adminCount = 0;
  h.verify = async () => ({ uid: "uid-1", email: "Owner@Example.COM" });
  h.created = [];
  h.roles = [];
  h.sessions = [];
  h.audits = [];
});

afterEach(() => { vi.unstubAllEnvs(); });

describe("the bootstrap gate", () => {
  it("refuses once any administrator exists", async () => {
    h.adminCount = 1;
    const response = await post({ idToken: GOOD_TOKEN, name: "Mallory" });
    expect(response.status).toBe(403);
    expect(h.created).toHaveLength(0);
    expect(h.sessions).toHaveLength(0);
  });

  it("refuses on a large existing workspace just the same", async () => {
    h.adminCount = 42;
    expect((await post({ idToken: GOOD_TOKEN, name: "Mallory" })).status).toBe(403);
    expect(h.created).toHaveLength(0);
  });

  it("checks the gate before it even looks at the token", async () => {
    // Ordering matters: the gate must not be reachable past a body or token check that could be
    // made to throw, and a rejected caller should learn nothing about token validity.
    h.adminCount = 1;
    h.verify = async () => { throw new Error("verifier must not be reached"); };
    expect((await post({ idToken: "anything", name: "Mallory" })).status).toBe(403);
  });

  it("allows the very first administrator through", async () => {
    const response = await post({ idToken: GOOD_TOKEN, name: "Asha" });
    expect(response.status).toBe(201);
    expect(h.created).toHaveLength(1);
  });
});

describe("input validation", () => {
  it.each([
    ["a missing name", { idToken: GOOD_TOKEN }],
    ["an empty name", { idToken: GOOD_TOKEN, name: "   " }],
    ["a one-character name", { idToken: GOOD_TOKEN, name: "A" }],
  ])("refuses %s", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(h.created).toHaveLength(0);
  });

  it("refuses a missing token", async () => {
    expect((await post({ name: "Asha" })).status).toBe(400);
    expect(h.created).toHaveLength(0);
  });

  it("refuses a token that does not verify", async () => {
    h.verify = async () => { throw new Error("bad token"); };
    const response = await post({ idToken: "forged", name: "Asha" });
    expect(response.status).toBe(401);
    expect(h.created).toHaveLength(0);
    expect(h.sessions).toHaveLength(0);
  });

  it("refuses a verified token carrying no email", async () => {
    h.verify = async () => ({ uid: "uid-1" });
    expect((await post({ idToken: GOOD_TOKEN, name: "Asha" })).status).toBe(400);
    expect(h.created).toHaveLength(0);
  });

  it("truncates an absurdly long name rather than storing it whole", async () => {
    await post({ idToken: GOOD_TOKEN, name: "A".repeat(500) });
    expect(String(h.created[0].name)).toHaveLength(120);
  });
});

describe("where the new owner's identity comes from", () => {
  it("takes the uid from the verified token, never the body", async () => {
    await post({ idToken: GOOD_TOKEN, name: "Asha", uid: "attacker-uid", id: "attacker-uid" });
    expect(h.created[0].id).toBe("uid-1");
  });

  it("takes the email from the verified token, never the body", async () => {
    // Otherwise the owner could be created under an address the caller does not control.
    await post({ idToken: GOOD_TOKEN, name: "Asha", email: "attacker@example.com" });
    expect(h.created[0].email).toBe("owner@example.com");
  });

  it("normalises the token's email", async () => {
    await post({ idToken: GOOD_TOKEN, name: "Asha" });
    expect(h.created[0].email).toBe("owner@example.com");
  });

  it("always creates the owner role, whatever the body asks for", async () => {
    await post({ idToken: GOOD_TOKEN, name: "Asha", role: "viewer" });
    expect(h.created[0].role).toBe("owner");
  });

  it("grants the owner role every permission there is", async () => {
    await post({ idToken: GOOD_TOKEN, name: "Asha" });
    expect(h.roles[0]).toMatchObject({
      key: "owner",
      permissions: h.PERMISSIONS.map((p) => p.key),
    });
  });
});

describe("completion", () => {
  it("signs the new owner in with the token that was verified", async () => {
    await post({ idToken: GOOD_TOKEN, name: "Asha" });
    expect(h.sessions).toEqual([GOOD_TOKEN]);
  });

  it("records the account creation in the audit log", async () => {
    await post({ idToken: GOOD_TOKEN, name: "Asha" });
    expect(h.audits).toContain("account.created");
  });

  it("marks the Firestore admin active, since an inactive one cannot sign in", async () => {
    await post({ idToken: GOOD_TOKEN, name: "Asha" });
    expect(h.created[0].active).toBe(true);
  });
});

describe("under cutover", () => {
  beforeEach(() => { vi.stubEnv("SUPABASE_CUTOVER", "true"); vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_DB_URL", "postgresql://postgres:p@db.x.supabase.co:5432/postgres");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k"); });

  it("still refuses once an administrator exists", async () => {
    // The gate reads getAdminCount(), which is itself cutover-aware — so flipping providers must
    // not reopen the bootstrap on a workspace that already has admins.
    h.adminCount = 1;
    expect((await post({ idToken: GOOD_TOKEN, name: "Mallory" })).status).toBe(403);
    expect(h.created).toHaveLength(0);
  });

  it("creates the owner through the Postgres path", async () => {
    const response = await post({ idToken: GOOD_TOKEN, name: "Asha" });
    expect(response.status).toBe(201);
    expect(h.created[0]).toMatchObject({ id: "uid-1", email: "owner@example.com", role: "owner", stampLogin: true });
  });
});
