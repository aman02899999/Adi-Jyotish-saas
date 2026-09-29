import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/admin/demo-accounts mints three Owner-role admins and returns their shared password.
 * The team routes let only an existing owner grant the owner role; this route used to accept any
 * admin holding "roles", which let a non-owner hand themselves an Owner login.
 */

const admin = vi.hoisted(() => ({ current: null as null | { id: string; role: string; permissions: string[] } }));
const reached = vi.hoisted(() => ({ auth: 0 }));
vi.mock("@/lib/admin-auth", () => ({
  getCurrentAdmin: async () => admin.current,
  recordAudit: async () => {},
}));
// Anything past the permission check starts creating sign-in accounts; count it and stop there.
vi.mock("firebase-admin/auth", () => ({ getAuth: () => { reached.auth += 1; throw new Error("stop: past the permission check"); } }));
vi.mock("@/lib/firestore", () => ({ db: {} }));
vi.mock("@/lib/wallet", () => ({ rechargeWallet: async () => {} }));
vi.mock("@/lib/plans", () => ({ getAllPlans: async () => [] }));
vi.mock("@/lib/supabase-config", () => ({ isSupabaseCutoverActive: () => false }));

const { POST } = await import("@/app/api/admin/demo-accounts/route");

describe("POST /api/admin/demo-accounts", () => {
  beforeEach(() => { reached.auth = 0; });

  it("refuses an admin who can manage roles but is not an owner", async () => {
    admin.current = { id: "a1", role: "manager", permissions: ["roles", "team", "settings"] };
    const response = await POST();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("owner") });
    expect(reached.auth).toBe(0);
  });

  it("refuses a signed-out caller", async () => {
    admin.current = null;
    expect((await POST()).status).toBe(401);
    expect(reached.auth).toBe(0);
  });

  it("lets an owner through", async () => {
    admin.current = { id: "o1", role: "owner", permissions: ["roles"] };
    await POST().catch(() => {});
    expect(reached.auth).toBeGreaterThan(0);
  });
});
