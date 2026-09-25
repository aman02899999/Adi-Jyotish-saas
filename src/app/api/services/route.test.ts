import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({ current: null as null | { permissions: string[] } }));
vi.mock("@/lib/admin-auth", () => ({
  getCurrentAdmin: async () => admin.current,
  hasAdminPermission: (who: { permissions: string[] }, permission: string) => who.permissions.includes(permission),
  recordAudit: async () => {},
}));
vi.mock("@/lib/services", () => ({
  getAllServices: async () => [{ id: "live", active: true }, { id: "draft", active: false }],
  getPublishedServices: async () => [{ id: "live", active: true }],
  toSlug: (value: string) => value,
}));
vi.mock("@/lib/firestore", () => ({ db: {} }));

const { GET } = await import("@/app/api/services/route");
const ids = async () => ((await (await GET()).json()) as Array<{ id: string }>).map((row) => row.id);

describe("GET /api/services", () => {
  beforeEach(() => { admin.current = null; });

  it("shows the public only published services", async () => {
    expect(await ids()).toEqual(["live"]);
  });

  it("shows an admin without catalogue permission only published services", async () => {
    admin.current = { permissions: ["bookings"] };
    expect(await ids()).toEqual(["live"]);
  });

  it("shows catalogue admins drafts too", async () => {
    admin.current = { permissions: ["services"] };
    expect(await ids()).toEqual(["live", "draft"]);
  });
});
