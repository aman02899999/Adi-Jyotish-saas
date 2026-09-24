import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Accepting an administrator invitation: unauthenticated, and on the happy path it creates an
 * account at the identity provider and writes an `adminUsers` record carrying a role. Two things
 * keep that safe, and both are easy to lose in a refactor.
 *
 * The first is that the email and the role come from the *stored invitation*, never from the
 * request body. A route that read either from the body would let anyone holding a viewer
 * invitation mint themselves an owner, or claim an address they do not control.
 *
 * The second is the throttle. The token is 256 bits, so this is not about guessing it — it is
 * that an anonymous caller must not get unlimited Firestore reads and Auth writes. That is why
 * these tests drive the *real* rate limiter rather than a mock: a mock would happily report
 * "checkRateLimit was called" for a route that ignored the answer.
 */

const h = vi.hoisted(() => ({
  invite: null as null | { id: string; email: string; role: string },
  createUser: null as null | ((args: { email: string; password: string; displayName?: string }) => Promise<{ uid: string }>),
  adminDocs: [] as Array<Record<string, unknown>>,
  supabaseAdmins: [] as Array<Record<string, unknown>>,
  gotrue: [] as Array<Record<string, unknown>>,
  accepted: [] as string[],
  audits: [] as Array<{ action: string; meta: Record<string, unknown> }>,
}));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "ts" } }));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    createUser: async (args: { email: string; password: string; displayName?: string }) => {
      if (!h.createUser) throw new Error("no creator");
      return h.createUser(args);
    },
  }),
}));
vi.mock("@/lib/firestore", () => ({
  db: {
    collection: () => ({
      doc: (id: string) => ({
        async set(data: Record<string, unknown>) { h.adminDocs.push({ id, ...data }); },
      }),
    }),
  },
}));
vi.mock("@/lib/admin-auth", () => ({
  recordAudit: async (_actor: unknown, action: string, _entity: string, _id: string, meta: Record<string, unknown>) => {
    h.audits.push({ action, meta });
  },
}));
vi.mock("@/lib/admin-auth-supabase", () => ({
  createAdminInSupabase: async (row: Record<string, unknown>) => { h.supabaseAdmins.push(row); },
}));
vi.mock("@/lib/admin-invites", () => ({
  findAdminInviteByToken: async (token: string) => (token === GOOD_TOKEN ? h.invite : null),
  markAdminInviteAccepted: async (id: string) => { h.accepted.push(id); },
}));
vi.mock("@/lib/gotrue-admin", () => ({
  createGoTrueUser: async (args: Record<string, unknown>) => {
    h.gotrue.push(args);
    if (!h.createUser) throw new Error("no creator");
    return h.createUser(args as { email: string; password: string });
  },
}));

import { POST } from "./route";

const GOOD_TOKEN = "invite-token";
const VALID = { token: GOOD_TOKEN, name: "Priya Nair", password: "correct-horse-battery" };

/** Each test uses its own IP so the real limiter's buckets never collide across tests. */
let ipSeq = 0;
function nextIp() {
  ipSeq += 1;
  return `203.0.113.${ipSeq}`;
}

function post(body: unknown, ip: string) {
  return POST(new Request("https://example.test/api/auth/invite/accept", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  }));
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_CUTOVER", "false");
  h.invite = { id: "invite-1", email: "priya@example.test", role: "editor" };
  h.createUser = async () => ({ uid: "uid-new" });
  h.adminDocs = [];
  h.supabaseAdmins = [];
  h.gotrue = [];
  h.accepted = [];
  h.audits = [];
});

describe("POST /api/auth/invite/accept — throttle", () => {
  it("allows ten acceptances per hour from one address", async () => {
    const ip = nextIp();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await post({ ...VALID, token: "wrong" }, ip);
      expect(response.status).toBe(410);
    }
  });

  it("rejects the eleventh with 429 and a Retry-After", async () => {
    const ip = nextIp();
    for (let attempt = 0; attempt < 10; attempt += 1) await post({ ...VALID, token: "wrong" }, ip);

    const response = await post({ ...VALID, token: "wrong" }, ip);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("throttles before doing any work — a throttled valid token creates nothing", async () => {
    const ip = nextIp();
    for (let attempt = 0; attempt < 10; attempt += 1) await post({ ...VALID, token: "wrong" }, ip);

    const response = await post(VALID, ip);
    expect(response.status).toBe(429);
    expect(h.adminDocs).toHaveLength(0);
    expect(h.accepted).toHaveLength(0);
  });

  it("counts per address, so one abuser cannot lock out everybody else", async () => {
    const abuser = nextIp();
    for (let attempt = 0; attempt < 11; attempt += 1) await post({ ...VALID, token: "wrong" }, abuser);
    expect((await post({ ...VALID, token: "wrong" }, abuser)).status).toBe(429);

    const response = await post(VALID, nextIp());
    expect(response.status).toBe(201);
  });

  it("spends the budget on malformed requests too, so validation errors are not a free retry loop", async () => {
    const ip = nextIp();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await post({}, ip)).status).toBe(400);
    }
    expect((await post(VALID, ip)).status).toBe(429);
  });
});

describe("POST /api/auth/invite/accept — request validation", () => {
  it.each([
    ["no token", { ...VALID, token: "" }],
    ["a one-character name", { ...VALID, name: "A" }],
    ["a whitespace-only name", { ...VALID, name: "   " }],
    ["a password under ten characters", { ...VALID, password: "short" }],
    ["a password over 128 characters", { ...VALID, password: "x".repeat(129) }],
  ])("rejects %s with 400", async (_label, body) => {
    const response = await post(body, nextIp());
    expect(response.status).toBe(400);
    expect(h.adminDocs).toHaveLength(0);
  });

  it("accepts a password of exactly ten characters", async () => {
    const response = await post({ ...VALID, password: "0123456789" }, nextIp());
    expect(response.status).toBe(201);
  });

  it("accepts a password of exactly 128 characters", async () => {
    const response = await post({ ...VALID, password: "y".repeat(128) }, nextIp());
    expect(response.status).toBe(201);
  });
});

describe("POST /api/auth/invite/accept — the invitation", () => {
  it("returns 410 for a token that matches no live invitation", async () => {
    const response = await post({ ...VALID, token: "nope" }, nextIp());
    expect(response.status).toBe(410);
    expect(h.adminDocs).toHaveLength(0);
  });

  it("returns 410 when the invitation lookup finds nothing for a good-looking token", async () => {
    h.invite = null;
    const response = await post(VALID, nextIp());
    expect(response.status).toBe(410);
  });

  it("returns 409 without consuming the invitation when the account already exists", async () => {
    h.createUser = async () => { throw new Error("email-already-exists"); };
    const response = await post(VALID, nextIp());
    expect(response.status).toBe(409);
    expect(h.accepted).toHaveLength(0);
    expect(h.adminDocs).toHaveLength(0);
  });

  it("marks the invitation accepted once it has been used", async () => {
    await post(VALID, nextIp());
    expect(h.accepted).toEqual(["invite-1"]);
  });

  it("records an audit entry naming the granted role", async () => {
    await post(VALID, nextIp());
    expect(h.audits).toEqual([{ action: "team.invite_accepted", meta: { role: "editor" } }]);
  });
});

describe("POST /api/auth/invite/accept — identity comes from the invitation, not the request", () => {
  it("takes the email from the invitation and ignores one supplied in the body", async () => {
    await post({ ...VALID, email: "attacker@evil.test" }, nextIp());
    expect(h.adminDocs[0].email).toBe("priya@example.test");
  });

  it("takes the role from the invitation and ignores one supplied in the body", async () => {
    await post({ ...VALID, role: "owner" }, nextIp());
    expect(h.adminDocs[0].role).toBe("editor");
  });

  it("creates the auth user under the invited address, not the requested one", async () => {
    const seen: string[] = [];
    h.createUser = async ({ email }) => { seen.push(email); return { uid: "uid-new" }; };
    await post({ ...VALID, email: "attacker@evil.test" }, nextIp());
    expect(seen).toEqual(["priya@example.test"]);
  });

  it("keys the admin record by the uid the provider returned, not anything the caller sent", async () => {
    h.createUser = async () => ({ uid: "uid-from-provider" });
    await post({ ...VALID, id: "uid-i-picked", uid: "uid-i-picked" }, nextIp());
    expect(h.adminDocs[0].id).toBe("uid-from-provider");
  });

  it("trims and caps the display name at 120 characters", async () => {
    await post({ ...VALID, name: `  ${"n".repeat(200)}  ` }, nextIp());
    expect(h.adminDocs[0].name).toBe("n".repeat(120));
  });

  it("returns the created administrator with the invited role", async () => {
    const response = await post(VALID, nextIp());
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      admin: { id: "uid-new", name: "Priya Nair", email: "priya@example.test", role: "editor" },
    });
  });

  it("marks the new administrator active", async () => {
    await post(VALID, nextIp());
    expect(h.adminDocs[0].active).toBe(true);
  });
});

describe("POST /api/auth/invite/accept — under the Supabase cutover", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_CUTOVER", "true");
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_DB_URL", "postgresql://postgres:p@db.x.supabase.co:5432/postgres");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
  });

  it("creates the identity in GoTrue rather than Firebase", async () => {
    await post(VALID, nextIp());
    expect(h.gotrue).toEqual([{ email: "priya@example.test", password: VALID.password, name: "Priya Nair" }]);
    expect(h.adminDocs).toHaveLength(0);
  });

  it("writes the administrator to Postgres without stamping a login", async () => {
    await post(VALID, nextIp());
    expect(h.supabaseAdmins).toEqual([{
      id: "uid-new", name: "Priya Nair", email: "priya@example.test", role: "editor", stampLogin: false,
    }]);
  });

  it("still takes the role from the invitation", async () => {
    await post({ ...VALID, role: "owner" }, nextIp());
    expect(h.supabaseAdmins[0].role).toBe("editor");
  });

  it("still throttles", async () => {
    const ip = nextIp();
    for (let attempt = 0; attempt < 10; attempt += 1) await post({ ...VALID, token: "wrong" }, ip);
    expect((await post(VALID, ip)).status).toBe(429);
    expect(h.supabaseAdmins).toHaveLength(0);
  });
});
