import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  notifyAdmins,
} from "@/lib/notifications";

/**
 * Integration coverage for in-app notifications. Skipped unless SUPABASE_DB_URL
 * points at a reachable database carrying the migration schema.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/notifications.integration.test.ts
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const MEMBER = "member-notif-itest";
const OTHER = "member-notif-itest-other";
const ADMIN_A = "admin-notif-itest-a";
const ADMIN_B = "admin-notif-itest-b";

async function cleanup() {
  await query(`delete from public.notifications where recipient_id like $1`, ["%-notif-itest%"]);
}

beforeEach(async () => {
  if (!cutoverActive) return;
  await cleanup();
});

afterAll(async () => {
  if (!cutoverActive) return;
  await cleanup();
  await closePgPool();
});

/** notifications.recipient_id is deliberately not a foreign key, so these need no
 * member or admin row to exist. */
describeCutover("createNotification and getNotifications", () => {
  it("round-trips a notification, newest first", async () => {
    await createNotification({ recipientType: "member", recipientId: MEMBER, type: "booking_confirmed", title: "First", body: "one", link: "/bookings" });
    await createNotification({ recipientType: "member", recipientId: MEMBER, type: "payout_paid", title: "Second" });

    const rows = await getNotifications("member", MEMBER);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.title)).toEqual(["Second", "First"]);
    expect(rows[0].readAt).toBeNull();
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(rows[0].link).toBeNull();
    expect(rows[1].link).toBe("/bookings");
    expect(rows[1].body).toBe("one");
  });

  it("scopes by recipient id and by recipient type", async () => {
    await createNotification({ recipientType: "member", recipientId: MEMBER, type: "t", title: "mine" });
    await createNotification({ recipientType: "member", recipientId: OTHER, type: "t", title: "theirs" });
    await createNotification({ recipientType: "admin", recipientId: MEMBER, type: "t", title: "same id, different type" });

    const mine = await getNotifications("member", MEMBER);
    expect(mine.map((r) => r.title)).toEqual(["mine"]);
  });

  it("honours the limit", async () => {
    for (let index = 0; index < 5; index += 1) {
      await createNotification({ recipientType: "member", recipientId: MEMBER, type: "t", title: `n${index}` });
    }
    expect(await getNotifications("member", MEMBER, 2)).toHaveLength(2);
  });

  it("truncates the fields it is given", async () => {
    await createNotification({
      recipientType: "member",
      recipientId: MEMBER,
      type: "x".repeat(500),
      title: "y".repeat(500),
      body: "z".repeat(5000),
    });
    const [row] = await getNotifications("member", MEMBER);
    expect(row.type).toHaveLength(60);
    expect(row.title).toHaveLength(160);
    expect(row.body).toHaveLength(2000);
  });

  it.each([
    ["keeps a server-relative path", "/admin/payouts", "/admin/payouts"],
    ["keeps an https URL", "https://astronomers.in/x", "https://astronomers.in/x"],
    ["drops a protocol-relative URL", "//evil.test/x", null],
    ["drops a javascript: URI", "javascript:alert(1)", null],
    ["drops a data: URI", "data:text/html,<script>", null],
    ["drops a plain http URL", "http://astronomers.in/x", null],
    ["drops an unparseable string", "not a url at all", null],
    ["stores nothing for an empty link", "", null],
  ])("%s", async (_label, link, expected) => {
    // The link is rendered as an <Link href> in the notification bell, so a
    // javascript: URI here is a stored-XSS primitive.
    await createNotification({ recipientType: "member", recipientId: MEMBER, type: "t", title: "t", link });
    expect((await getNotifications("member", MEMBER))[0].link).toBe(expected);
  });
});

describeCutover("notifyAdmins", () => {
  it("fans out one row per admin in a single statement", async () => {
    await notifyAdmins([ADMIN_A, ADMIN_B], { type: "new_order", title: "New order", body: "body", link: "/admin/orders" });

    const a = await getNotifications("admin", ADMIN_A);
    const b = await getNotifications("admin", ADMIN_B);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].recipientType).toBe("admin");
    expect(a[0].title).toBe("New order");
    expect(a[0].link).toBe("/admin/orders");
  });

  it("writes nothing for an empty recipient list", async () => {
    await notifyAdmins([], { type: "new_order", title: "New order" });
    const result = await query(`select count(*)::int as n from public.notifications where recipient_id like $1`, ["admin-notif-itest%"]);
    expect(result.rows[0].n).toBe(0);
  });
});

describeCutover("unread counts and read marking", () => {
  it("counts only unread rows, and as a number", async () => {
    await createNotification({ recipientType: "member", recipientId: MEMBER, type: "t", title: "one" });
    await createNotification({ recipientType: "member", recipientId: MEMBER, type: "t", title: "two" });
    await createNotification({ recipientType: "member", recipientId: OTHER, type: "t", title: "other" });

    const count = await getUnreadCount("member", MEMBER);
    expect(count).toBe(2);
    expect(typeof count).toBe("number");
  });

  it("marks one notification read and drops it from the count", async () => {
    await createNotification({ recipientType: "member", recipientId: MEMBER, type: "t", title: "one" });
    const [row] = await getNotifications("member", MEMBER);

    await markNotificationRead(row.id, "member", MEMBER);
    expect(await getUnreadCount("member", MEMBER)).toBe(0);
    expect((await getNotifications("member", MEMBER))[0].readAt).toBeInstanceOf(Date);
  });

  it("refuses to mark someone else's notification read", async () => {
    await createNotification({ recipientType: "member", recipientId: MEMBER, type: "t", title: "private" });
    const [row] = await getNotifications("member", MEMBER);

    // Ownership is enforced in the WHERE clause, so a wrong recipient is a
    // no-op rather than a leak.
    await markNotificationRead(row.id, "member", OTHER);
    await markNotificationRead(row.id, "admin", MEMBER);
    expect(await getUnreadCount("member", MEMBER)).toBe(1);
    expect((await getNotifications("member", MEMBER))[0].readAt).toBeNull();
  });

  it("ignores an unknown id", async () => {
    await markNotificationRead("notif-itest-ghost", "member", MEMBER);
    expect(await getUnreadCount("member", MEMBER)).toBe(0);
  });

  it("marks all of one recipient's notifications read and nobody else's", async () => {
    await createNotification({ recipientType: "member", recipientId: MEMBER, type: "t", title: "a" });
    await createNotification({ recipientType: "member", recipientId: MEMBER, type: "t", title: "b" });
    await createNotification({ recipientType: "member", recipientId: OTHER, type: "t", title: "keep" });

    await markAllNotificationsRead("member", MEMBER);
    expect(await getUnreadCount("member", MEMBER)).toBe(0);
    expect(await getUnreadCount("member", OTHER)).toBe(1);
  });

  it("is a no-op when there is nothing unread", async () => {
    await markAllNotificationsRead("member", MEMBER);
    expect(await getUnreadCount("member", MEMBER)).toBe(0);
  });
});
