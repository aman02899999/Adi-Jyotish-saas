import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import {
  createThreadWithMessageInSupabase,
  deleteThreadInSupabase,
  getThreadForAdminInSupabase,
  getThreadForMemberInSupabase,
  markThreadReadByAdminInSupabase,
  markThreadReadByMemberInSupabase,
  replyToThreadInSupabase,
  setThreadStatusInSupabase,
} from "@/lib/messaging-supabase";

/**
 * Integration tests for the inbox write path. Skipped unless SUPABASE_DB_URL
 * points at a reachable database.
 *
 * The reads were already covered by messaging.integration.test.ts; these cover
 * the four message routes. The interesting properties are the ones about who may
 * see and change what: a member cannot reach another member's thread, an admin
 * reply reopens a closed thread while a member reply must not, and marking a
 * thread read only clears the flags belonging to that side of the conversation.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "msgw_itest_";
const MEMBER_A = `${P}memberA`;
const MEMBER_B = `${P}memberB`;

const cleanup = async () => {
  // inbox_messages cascades from the thread, but delete it explicitly so a partial
  // failure in one run cannot leave rows that break the next.
  await query(`delete from public.inbox_messages where thread_id in (select id from public.message_threads where id like 'msgw\\_itest\\_%')`);
  await query(`delete from public.message_threads where id like 'msgw\\_itest\\_%'`);
  await query(`delete from public.members where id like 'msgw\\_itest\\_%'`);
};

describeDb("inbox writes (live database)", () => {
  beforeAll(async () => {
    await cleanup();
    await query(`insert into public.members (id, name, email) values ($1, 'Member A', $2)`, [MEMBER_A, `${MEMBER_A}@example.test`]);
    await query(`insert into public.members (id, name, email) values ($1, 'Member B', $2)`, [MEMBER_B, `${MEMBER_B}@example.test`]);
  });

  afterAll(cleanup);

  it("opens a thread with its first message, stamped identically", async () => {
    const created = await createThreadWithMessageInSupabase({
      memberId: MEMBER_A, subject: `${P}Billing question`, category: "billing",
      senderType: "member", senderName: "Member A", body: "Why was I charged twice?",
    });

    expect(created.thread).toMatchObject({
      id: created.thread.id, subject: `${P}Billing question`, category: "billing", status: "open",
    });
    // The sender has read their own message; the other side has not.
    expect(created.message).toMatchObject({
      threadId: created.thread.id, senderType: "member", senderName: "Member A",
      body: "Why was I charged twice?", readByMember: true, readByAdmin: false,
    });
    // The inbox sorts on lastMessageAt, so it must equal the message's own timestamp.
    expect(created.thread.lastMessageAt.getTime()).toBe(created.message.createdAt.getTime());
  });

  it("stamps an admin's first message the other way round", async () => {
    const created = await createThreadWithMessageInSupabase({
      memberId: MEMBER_B, subject: `${P}From the studio`, category: "general",
      senderType: "admin", senderName: "Studio", body: "Your reading is ready.",
    });
    expect(created.message).toMatchObject({ senderType: "admin", readByAdmin: true, readByMember: false });
  });

  it("appends a reply and moves the thread to the top of the inbox", async () => {
    const created = await createThreadWithMessageInSupabase({
      memberId: MEMBER_A, subject: `${P}Reply test`, category: "support",
      senderType: "member", senderName: "Member A", body: "First",
    });
    const before = created.thread.lastMessageAt.getTime();

    await new Promise((resolve) => setTimeout(resolve, 20));
    const reply = await replyToThreadInSupabase({
      threadId: created.thread.id, senderType: "admin", senderName: "Studio",
      body: "Looking into it.", reopen: true,
    });
    expect(reply).toMatchObject({ threadId: created.thread.id, senderType: "admin", readByAdmin: true, readByMember: false });
    expect(reply!.createdAt.getTime()).toBeGreaterThan(before);

    const thread = await getThreadForAdminInSupabase(created.thread.id);
    expect(thread!.status).toBe("open");
    // The thread's own timestamp has to move too, or the reply lands but the
    // conversation stays buried in its old position in the inbox.
    const { rows } = await query<{ last_message_at: Date }>(
      `select last_message_at from public.message_threads where id = $1`,
      [created.thread.id],
    );
    expect(rows[0].last_message_at.getTime()).toBeGreaterThanOrEqual(reply!.createdAt.getTime());
    expect(rows[0].last_message_at.getTime()).toBeGreaterThan(before);
  });

  it("reopens a closed thread for an admin but not for a member", async () => {
    const created = await createThreadWithMessageInSupabase({
      memberId: MEMBER_A, subject: `${P}Closed thread`, category: "support",
      senderType: "member", senderName: "Member A", body: "Hello",
    });
    await setThreadStatusInSupabase(created.thread.id, "closed");

    // A member's reply leaves it closed — the route answers 409 before getting here,
    // but the writer must not reopen it either if that check is ever bypassed.
    await replyToThreadInSupabase({
      threadId: created.thread.id, senderType: "member", senderName: "Member A", body: "Still here", reopen: false,
    });
    expect((await getThreadForAdminInSupabase(created.thread.id))!.status).toBe("closed");

    await replyToThreadInSupabase({
      threadId: created.thread.id, senderType: "admin", senderName: "Studio", body: "Reopening", reopen: true,
    });
    expect((await getThreadForAdminInSupabase(created.thread.id))!.status).toBe("open");
  });

  it("returns null for a reply to a thread that is gone", async () => {
    expect(await replyToThreadInSupabase({
      threadId: `${P}ghost`, senderType: "admin", senderName: "Studio", body: "Nobody home", reopen: true,
    })).toBeNull();

    const { rows } = await query<{ n: number }>(
      `select count(*)::int as n from public.inbox_messages where body = 'Nobody home'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it("scopes thread lookup to the member who owns it", async () => {
    const created = await createThreadWithMessageInSupabase({
      memberId: MEMBER_A, subject: `${P}Private`, category: "general",
      senderType: "member", senderName: "Member A", body: "Private matter",
    });
    expect(await getThreadForMemberInSupabase(created.thread.id, MEMBER_A)).toMatchObject({ status: "open" });
    // Another member gets the same "not found" as a bad id — the route cannot leak
    // which thread ids exist.
    expect(await getThreadForMemberInSupabase(created.thread.id, MEMBER_B)).toBeNull();
    expect(await getThreadForMemberInSupabase(`${P}ghost`, MEMBER_A)).toBeNull();

    expect(await getThreadForAdminInSupabase(created.thread.id)).toMatchObject({ subject: `${P}Private`, status: "open" });
    expect(await getThreadForAdminInSupabase(`${P}ghost`)).toBeNull();
  });

  it("clears only the flags belonging to the side marking the thread read", async () => {
    const created = await createThreadWithMessageInSupabase({
      memberId: MEMBER_A, subject: `${P}Unread`, category: "support",
      senderType: "member", senderName: "Member A", body: "From the member",
    });
    await replyToThreadInSupabase({
      threadId: created.thread.id, senderType: "admin", senderName: "Studio", body: "From the admin", reopen: true,
    });
    // An admin-sent row the admin has somehow not read. Firestore filtered on
    // senderType == 'member' as well, so marking the thread read must leave this one
    // alone rather than silently rewriting the other side of the conversation.
    await query(
      `insert into public.inbox_messages (id, thread_id, sender_type, sender_name, body, read_by_admin, read_by_member)
       values ($1, $2, 'admin', 'Studio', 'Stray admin row', false, true)`,
      [`${P}stray`, created.thread.id],
    );

    // The member's message is unread for the admin; the admin's is unread for the member.
    expect(await markThreadReadByAdminInSupabase(created.thread.id)).toBe(1);
    expect(await markThreadReadByAdminInSupabase(created.thread.id)).toBe(0);
    const { rows: stray } = await query<{ read_by_admin: boolean }>(
      `select read_by_admin from public.inbox_messages where id = $1`, [`${P}stray`],
    );
    expect(stray[0].read_by_admin).toBe(false);

    // The member's own unread flag on the admin's reply is untouched by the above.
    expect(await markThreadReadByMemberInSupabase(created.thread.id)).toBe(1);
    expect(await markThreadReadByMemberInSupabase(created.thread.id)).toBe(0);
  });

  it("changes a thread's status", async () => {
    const created = await createThreadWithMessageInSupabase({
      memberId: MEMBER_A, subject: `${P}Status`, category: "support",
      senderType: "member", senderName: "Member A", body: "x",
    });
    expect(await setThreadStatusInSupabase(created.thread.id, "closed")).toBe(true);
    expect((await getThreadForAdminInSupabase(created.thread.id))!.status).toBe("closed");
    expect(await setThreadStatusInSupabase(`${P}ghost`, "closed")).toBe(false);
  });

  it("deletes a thread, takes its messages with it, and reports the subject once", async () => {
    const created = await createThreadWithMessageInSupabase({
      memberId: MEMBER_A, subject: `${P}Delete me`, category: "general",
      senderType: "member", senderName: "Member A", body: "Doomed",
    });
    await replyToThreadInSupabase({
      threadId: created.thread.id, senderType: "admin", senderName: "Studio", body: "Also doomed", reopen: true,
    });

    expect(await deleteThreadInSupabase(created.thread.id)).toBe(`${P}Delete me`);
    expect(await getThreadForAdminInSupabase(created.thread.id)).toBeNull();

    const { rows } = await query<{ n: number }>(
      `select count(*)::int as n from public.inbox_messages where thread_id = $1`,
      [created.thread.id],
    );
    expect(rows[0].n).toBe(0);

    // Already gone — the route answers 404 rather than a second silent success.
    expect(await deleteThreadInSupabase(created.thread.id)).toBeNull();
  });
});
