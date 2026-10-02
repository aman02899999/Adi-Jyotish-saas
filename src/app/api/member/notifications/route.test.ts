import { beforeEach, describe, expect, it, vi } from "vitest";

/** The bell polls `?count=1` every minute; only opening it may load the list (up to 30 reads). */
const getNotifications = vi.fn(async () => [{ id: "n1" }]);
const getUnreadCount = vi.fn(async () => 3);
vi.mock("@/lib/notifications", () => ({ getNotifications, getUnreadCount }));
vi.mock("@/lib/member-auth", () => ({ getCurrentMember: async () => ({ id: "member-1" }) }));

const { GET } = await import("./route");

describe("GET /api/member/notifications", () => {
  beforeEach(() => { getNotifications.mockClear(); getUnreadCount.mockClear(); });

  it("answers the poll with the unread count alone, without reading the list", async () => {
    const response = await GET(new Request("http://localhost/api/member/notifications?count=1"));
    await expect(response.json()).resolves.toEqual({ unreadCount: 3 });
    expect(getNotifications).not.toHaveBeenCalled();
  });

  it("returns the list and the count when the panel opens", async () => {
    const response = await GET(new Request("http://localhost/api/member/notifications"));
    await expect(response.json()).resolves.toEqual({ items: [{ id: "n1" }], unreadCount: 3 });
  });
});
