import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import {
  getAdminInbox,
  getAdminUnreadCount,
  getMemberInbox,
  getMemberUnreadCount,
  sendBookingNotification,
} from "@/lib/messaging";

/**
 * Integration test for the inbox port. Skipped unless SUPABASE_DB_URL points at a
 * reachable database.
 *
 * Two things get specific attention: the member name and email must come from a
 * join on members rather than from message_threads' own member_name/member_email
 * columns, which no write path ever populates; and two notifications for one
 * booking must not open two threads.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "inbox_itest_";

async function seedMember(id: string, email: string, name: string) {
  await query(
    `insert into public.members (id, name, email) values ($1,$2,$3)
     on conflict (id) do update set name = excluded.name, email = excluded.email`,
    [id, name, email],
  );
}

/** Inserts a thread directly, leaving member_name/member_email at their empty
 * defaults — which is exactly the state every copied thread arrives in. */
async function seedThread(id: string, memberId: string, opts: { bookingId?: string | null; subject?: string; minutesAgo?: number } = {}) {
  await query(
    `insert into public.message_threads (id, member_id, booking_id, subject, category, status, last_message_at, created_at, updated_at)
     values ($1,$2,$3,$4,'booking','open', now() - make_interval(mins => $5), now() - make_interval(mins => $5), now())`,
    [id, memberId, opts.bookingId ?? null, opts.subject ?? `Subject ${id}`, opts.minutesAgo ?? 0],
  );
}

async function seedMessage(threadId: string, opts: { senderType: string; readByMember?: boolean; readByAdmin?: boolean; body?: string; secondsAgo?: number }) {
  const id = `${P}msg_${threadId}_${Math.random().toString(36).slice(2, 10)}`;
  await query(
    `insert into public.inbox_messages (id, thread_id, sender_type, sender_name, body, read_by_member, read_by_admin, created_at)
     values ($1,$2,$3,'Test',$4,$5,$6, now() - make_interval(secs => $7))`,
    [id, threadId, opts.senderType, opts.body ?? "hello", opts.readByMember ?? false, opts.readByAdmin ?? false, opts.secondsAgo ?? 0],
  );
  return id;
}

async function seedBooking(id: string, memberId: string | null) {
  await query(`insert into public.services (id, title, slug) values ($1,$2,$3) on conflict (id) do nothing`, [`${P}svc`, "Test Service", `${P}svc`]);
  await query(
    `insert into public.practitioners (id, name, slug, email) values ($1,$2,$3,$4) on conflict (id) do nothing`,
    [`${P}prac`, "Test Practitioner", `${P}prac`, `${P}prac@example.test`],
  );
  await query(
    `insert into public.bookings (id, reference, service_id, service_title, practitioner_id, practitioner_name, client_name, client_email, scheduled_at, member_id)
     values ($1,$2,$3,'Test Service',$4,'Test Practitioner','Client',$5,now(),$6)
     on conflict (id) do nothing`,
    [id, `${P}ref_${id}`, `${P}svc`, `${P}prac`, `${P}client@example.test`, memberId],
  );
}

async function cleanup() {
  await query(`delete from public.inbox_messages where thread_id like $1 or id like $1`, [`${P}%`]);
  await query(`delete from public.message_threads where id like $1`, [`${P}%`]);
  await query(`delete from public.bookings where id like $1`, [`${P}%`]);
  await query(`delete from public.members where id like $1`, [`${P}%`]);
  await query(`delete from public.services where id like $1`, [`${P}%`]);
  await query(`delete from public.practitioners where id like $1`, [`${P}%`]);
}

describeDb("inbox (live database)", () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("reads the member's name and email from the join, not the empty columns", async () => {
    await seedMember(`${P}m1`, `${P}m1@example.test`, "Real Name");
    await seedThread(`${P}t1`, `${P}m1`, { subject: "About your booking" });

    const stored = await query(`select member_name, member_email::text as member_email from public.message_threads where id = $1`, [`${P}t1`]);
    // Proves the premise: the denormalised columns really are empty, so anything
    // reading them would show a blank sender.
    expect(stored.rows[0]).toMatchObject({ member_name: "", member_email: "" });

    const inbox = await getAdminInbox();
    const thread = inbox.find((t) => t.id === `${P}t1`);
    expect(thread?.memberName).toBe("Real Name");
    expect(thread?.memberEmail).toBe(`${P}m1@example.test`);
  });

  it("returns threads newest-first with each thread's messages oldest-first", async () => {
    await seedMember(`${P}m2`, `${P}m2@example.test`, "Second");
    await seedThread(`${P}old`, `${P}m2`, { minutesAgo: 30 });
    await seedThread(`${P}new`, `${P}m2`, { minutesAgo: 1 });

    await seedMessage(`${P}old`, { senderType: "member", body: "first", secondsAgo: 300 });
    await seedMessage(`${P}old`, { senderType: "admin", body: "second", secondsAgo: 200 });
    await seedMessage(`${P}new`, { senderType: "member", body: "recent", secondsAgo: 10 });

    const inbox = await getAdminInbox();
    const ours = inbox.filter((t) => t.id.startsWith(P));
    expect(ours.map((t) => t.id)).toEqual([`${P}new`, `${P}old`]);
    expect(ours.find((t) => t.id === `${P}old`)?.messages.map((m) => m.body)).toEqual(["first", "second"]);
  });

  it("scopes a member's inbox to their own threads", async () => {
    await seedMember(`${P}mine`, `${P}mine@example.test`, "Mine");
    await seedMember(`${P}theirs`, `${P}theirs@example.test`, "Theirs");
    await seedThread(`${P}t_mine`, `${P}mine`);
    await seedThread(`${P}t_theirs`, `${P}theirs`);

    const inbox = await getMemberInbox(`${P}mine`);
    expect(inbox.map((t) => t.id)).toEqual([`${P}t_mine`]);
  });

  it("counts admin unread only from member-sent messages", async () => {
    await seedMember(`${P}m3`, `${P}m3@example.test`, "Third");
    await seedThread(`${P}t3`, `${P}m3`);

    // Other files share this database, so this is a delta rather than an absolute —
    // but the rows added alongside the one that should count are what make the delta
    // sensitive to the filters. Without them, dropping sender_type or read_by_admin
    // would shift the baseline and the result by the same amount and still pass.
    const before = await getAdminUnreadCount();
    await seedMessage(`${P}t3`, { senderType: "member", readByAdmin: false });
    await seedMessage(`${P}t3`, { senderType: "system", readByAdmin: false });
    await seedMessage(`${P}t3`, { senderType: "admin", readByAdmin: false });
    await seedMessage(`${P}t3`, { senderType: "member", readByAdmin: true });
    expect(await getAdminUnreadCount()).toBe(before + 1);
  });

  it("counts a member's unread only for admin and system messages on their threads", async () => {
    await seedMember(`${P}m4`, `${P}m4@example.test`, "Fourth");
    await seedMember(`${P}m5`, `${P}m5@example.test`, "Fifth");
    await seedThread(`${P}t4`, `${P}m4`);
    await seedThread(`${P}t5`, `${P}m5`);

    await seedMessage(`${P}t4`, { senderType: "admin", readByMember: false });
    await seedMessage(`${P}t4`, { senderType: "system", readByMember: false });
    await seedMessage(`${P}t4`, { senderType: "member", readByMember: false });
    await seedMessage(`${P}t4`, { senderType: "admin", readByMember: true });
    await seedMessage(`${P}t5`, { senderType: "admin", readByMember: false });

    expect(await getMemberUnreadCount(`${P}m4`)).toBe(2);
    expect(await getMemberUnreadCount(`${P}m5`)).toBe(1);
  });

  it("opens a thread for a booking notification and reuses it next time", async () => {
    await seedMember(`${P}m6`, `${P}m6@example.test`, "Sixth");
    await seedBooking(`${P}booking1`, `${P}m6`);

    const first = await sendBookingNotification({
      memberEmail: `${P}m6@example.test`,
      bookingId: `${P}booking1`,
      subject: "Payment received",
      body: "Thanks!",
    });
    expect(first).not.toBeNull();
    expect(first?.senderType).toBe("system");
    expect(first?.readByAdmin).toBe(true);
    expect(first?.readByMember).toBe(false);

    const second = await sendBookingNotification({
      memberEmail: `${P}m6@example.test`,
      bookingId: `${P}booking1`,
      subject: "Payment received (updated)",
      body: "Receipt ready",
    });
    expect(second?.threadId).toBe(first?.threadId);

    const { rows } = await query<{ n: number; subject: string }>(
      `select count(*)::int n, min(subject) subject from public.message_threads where member_id = $1`,
      [`${P}m6`],
    );
    expect(rows[0]?.n).toBe(1);
    expect(rows[0]?.subject).toBe("Payment received (updated)");

    const messages = await query<{ n: number }>(`select count(*)::int n from public.inbox_messages where thread_id = $1`, [first?.threadId]);
    expect(messages.rows[0]?.n).toBe(2);
  });

  it("reopens a closed thread when a new notification arrives", async () => {
    await seedMember(`${P}m10`, `${P}m10@example.test`, "Tenth");
    await seedBooking(`${P}booking6`, `${P}m10`);
    await query(
      `insert into public.message_threads (id, member_id, booking_id, subject, status, last_message_at)
       values ($1,$2,$3,'Old subject','closed',now())`,
      [`${P}closed`, `${P}m10`, `${P}booking6`],
    );

    await sendBookingNotification({
      memberEmail: `${P}m10@example.test`,
      bookingId: `${P}booking6`,
      subject: "New subject",
      body: "Reopening",
    });

    const { rows } = await query<{ status: string; subject: string }>(
      `select status, subject from public.message_threads where id = $1`,
      [`${P}closed`],
    );
    expect(rows[0]).toMatchObject({ status: "open", subject: "New subject" });
  });

  it("returns null for an email no member has", async () => {
    const result = await sendBookingNotification({
      memberEmail: `${P}nobody@example.test`,
      bookingId: `${P}booking2`,
      subject: "Hello",
      body: "Anyone there?",
    });
    expect(result).toBeNull();
  });

  it("matches the member email case-insensitively", async () => {
    await seedMember(`${P}m7`, `${P}m7@example.test`, "Seventh");
    await seedBooking(`${P}booking3`, `${P}m7`);
    const result = await sendBookingNotification({
      memberEmail: `${P}M7@EXAMPLE.TEST`,
      bookingId: `${P}booking3`,
      subject: "Case",
      body: "Body",
    });
    expect(result).not.toBeNull();
  });

  it("truncates an over-long body", async () => {
    await seedMember(`${P}m8`, `${P}m8@example.test`, "Eighth");
    await seedBooking(`${P}booking4`, `${P}m8`);
    const message = await sendBookingNotification({
      memberEmail: `${P}m8@example.test`,
      bookingId: `${P}booking4`,
      subject: "Long",
      body: "x".repeat(5000),
    });
    expect(message?.body).toHaveLength(3000);
  });

  it("opens one thread when two notifications for a booking arrive together", async () => {
    // The find-or-create is a query and then an insert, so without serialisation
    // both calls see no thread and both open one, and the member sees the same
    // subject twice in their inbox.
    await seedMember(`${P}m9`, `${P}m9@example.test`, "Ninth");
    await seedBooking(`${P}booking5`, `${P}m9`);

    // The pool opens connections lazily, which staggers calls enough to hide a
    // missing lock, so warm it before the race.
    await Promise.all(Array.from({ length: 10 }, () => query(`select 1`)));

    await Promise.all([
      sendBookingNotification({ memberEmail: `${P}m9@example.test`, bookingId: `${P}booking5`, subject: "Same", body: "one" }),
      sendBookingNotification({ memberEmail: `${P}m9@example.test`, bookingId: `${P}booking5`, subject: "Same", body: "two" }),
    ]);

    const { rows } = await query<{ n: number }>(
      `select count(*)::int n from public.message_threads where member_id = $1 and booking_id = $2`,
      [`${P}m9`, `${P}booking5`],
    );
    expect(rows[0]?.n).toBe(1);
  });
});
