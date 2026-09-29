import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deleting every synthetic review rewrites every practitioner's review history at once, so it is
 * held to the same bar creating them was: reviews AND practitioners. Holding only one must not be
 * enough, and the action must be audited.
 */

const h = vi.hoisted(() => ({
  admin: null as null | { id: string; permissions: string[] },
  purged: 0,
  purgeCalls: 0,
  audits: [] as Array<{ action: string; meta: Record<string, unknown> }>,
}));

vi.mock("@/lib/admin-auth", () => ({
  getCurrentAdmin: async () => h.admin,
  hasAdminPermission: (admin: { permissions: string[] }, permission: string) => admin.permissions.includes(permission),
  recordAudit: async (_admin: unknown, action: string, _type: string, _id: string, meta: Record<string, unknown>) => {
    h.audits.push({ action, meta });
  },
}));
vi.mock("@/lib/synthetic-reviews", () => ({
  purgeSyntheticReviews: async () => { h.purgeCalls += 1; return h.purged; },
}));

import { DELETE } from "./route";

beforeEach(() => {
  h.admin = { id: "admin-1", permissions: ["reviews", "practitioners"] };
  h.purged = 42;
  h.purgeCalls = 0;
  h.audits = [];
});

describe("DELETE /api/admin/reviews/synthetic", () => {
  it("refuses a signed-out caller", async () => {
    h.admin = null;
    expect((await DELETE()).status).toBe(401);
    expect(h.purgeCalls).toBe(0);
  });

  it.each([
    ["reviews only", ["reviews"]],
    ["practitioners only", ["practitioners"]],
    ["neither", ["billing"]],
  ])("refuses an admin with %s", async (_label, permissions) => {
    h.admin = { id: "admin-1", permissions };
    expect((await DELETE()).status).toBe(403);
    expect(h.purgeCalls).toBe(0);
  });

  it("purges and reports the count with both permissions", async () => {
    const response = await DELETE();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 42 });
    expect(h.purgeCalls).toBe(1);
  });

  it("records who purged and how many", async () => {
    await DELETE();
    expect(h.audits).toEqual([{ action: "reviews.synthetic_purged", meta: { deleted: 42 } }]);
  });
});
