import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// --- Modules chat.ts calls that are NOT ported yet ---------------------------------------------
// subscriptions.ts and marketplace.ts still read Firestore, so chat's cutover path
// cannot run without them. Mocked here; see the note in docs/supabase-migration.md.
vi.mock("@/lib/subscriptions", () => ({
  getMemberDiscountPercent: async () => 0,
  // The real implementation, restated so the pricing math under test is unchanged.
  applyDiscount: (amount: number, discountPercent: number) =>
    discountPercent ? Math.max(0, Math.round((amount * (100 - discountPercent)) / 100)) : amount,
}));

const MARKETPLACE_SESSION_PRICE = 300;
vi.mock("@/lib/marketplace", () => ({
  getMarketplacePractitioners: async () => [{ id: "itest-prac-ai", sessionPrice: MARKETPLACE_SESSION_PRICE }],
}));

// unstable_cache needs Next's incremental cache, which does not exist in vitest.
// wallet.ts reads the studio currency through it on every hold, so it must be mocked.
vi.mock("@/lib/studio-settings", () => ({
  getStudioSettings: async () => ({
    studioName: "Adi Jyotish Guru",
    supportEmail: "support@adijyotishguru.com",
    timezone: "Asia/Kolkata",
    currency: "INR",
    cancellationHours: 24,
    bookingLeadMinutes: 15,
    replySlaHours: 24,
    gstRate: 18,
    gstin: null,
    updatedAt: new Date().toISOString(),
  }),
}));

// Ably publishes over the network and Gemini needs an API key; neither belongs in a test.
vi.mock("@/lib/ably", () => ({ publishChatEvent: async () => {}, chatChannelName: (id: string) => `chat:${id}` }));
vi.mock("@/lib/gemini", () => ({ isGeminiConfigured: () => false, getPractitionerChatReply: async () => "" }));

import {
  ChatSessionConflictError,
  ChatSessionNotFoundError,
  endChatSession,
  getMemberActiveSession,
  getSessionForAdmin,
  getSessionOr404,
  InsufficientBalanceError,
  listActiveSessionsForAdmin,
  listSessionMessages,
  listSessionsForPractitioner,
  PractitionerUnavailableError,
  sendMessage,
  startChatSession,
} from "@/lib/chat";
import { closePgPool, query } from "@/lib/postgres";

/**
 * chat.ts through the cutover gate, against a real database.
 *
 * The point of this file is the interaction between the chat lock and the wallet:
 * a session start reserves real balance, so a lock that fails to serialise means a
 * member is charged twice for one chat, and a lock that fails to release means they
 * can never start another.
 *
 * Requires SUPABASE_DB_URL. Skipped otherwise.
 */
const describeChat = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

const MEMBER_ID = "itest-chat-member";
const PRAC_METERED = "itest-prac-metered";
const PRAC_AI = "itest-prac-ai";
const PRAC_OFFLINE = "itest-prac-offline";

const RATE = 100;

async function balance(): Promise<number> {
  const { rows } = await query(`select balance from public.wallets where id = $1`, [MEMBER_ID]);
  return Number(rows[0].balance);
}

async function lockHeld(): Promise<boolean> {
  const { rows } = await query(`select 1 from public.chat_active_locks where member_id = $1`, [MEMBER_ID]);
  return rows.length > 0;
}

describeChat("chat on Postgres", () => {
  beforeAll(async () => {
    await query(`delete from public.chat_messages where session_id in (select id from public.chat_sessions where member_id = $1)`, [MEMBER_ID]);
    await query(`delete from public.chat_sessions where member_id = $1`, [MEMBER_ID]);
    await query(`delete from public.chat_active_locks where member_id = $1`, [MEMBER_ID]);
    await query(`delete from public.wallet_entries where wallet_id = $1`, [MEMBER_ID]);
    await query(`delete from public.wallet_holds where wallet_id = $1`, [MEMBER_ID]);
    await query(`delete from public.wallets where id = $1`, [MEMBER_ID]);
    await query(`delete from public.practitioners where id like $1`, ["itest-prac-%"]);
    await query(`delete from public.members where id = $1`, [MEMBER_ID]);

    await query(`insert into public.members (id, name, email) values ($1, $2, $3)`, [MEMBER_ID, "Chat Test Member", "chat-itest@example.com"]);
    await query(
      `insert into public.practitioners (id, name, slug, email, active, online, chat_rate_per_minute, is_ai_powered, is_demo_account)
       values ($1, $2, $3, $4, true, true, $5, false, false)`,
      [PRAC_METERED, "Metered Ji", "itest-metered", "metered@example.com", RATE],
    );
    await query(
      `insert into public.practitioners (id, name, slug, email, active, online, chat_rate_per_minute, is_ai_powered, is_demo_account)
       values ($1, $2, $3, $4, true, true, 0, true, false)`,
      [PRAC_AI, "AI Ji", "itest-ai", "ai@example.com"],
    );
    await query(
      `insert into public.practitioners (id, name, slug, email, active, online, chat_rate_per_minute, is_ai_powered, is_demo_account)
       values ($1, $2, $3, $4, true, false, $5, false, false)`,
      [PRAC_OFFLINE, "Offline Ji", "itest-offline", "offline@example.com", RATE],
    );
    // Fund the wallet directly; the recharge path is covered by the wallet tests.
    await query(`insert into public.wallets (id, member_id, currency, balance) values ($1, $1, 'INR', 1000)`, [MEMBER_ID]);
  });

  afterAll(async () => {
    await query(`delete from public.chat_messages where session_id in (select id from public.chat_sessions where member_id = $1)`, [MEMBER_ID]);
    await query(`delete from public.chat_sessions where member_id = $1`, [MEMBER_ID]);
    await query(`delete from public.chat_active_locks where member_id = $1`, [MEMBER_ID]);
    await query(`delete from public.practitioners where id like $1`, ["itest-prac-%"]);
    await query(`delete from public.members where id = $1`, [MEMBER_ID]);
    await closePgPool();
  });

  it("refuses an offline practitioner before reserving anything", async () => {
    await expect(startChatSession(MEMBER_ID, PRAC_OFFLINE)).rejects.toBeInstanceOf(PractitionerUnavailableError);
    expect(await lockHeld()).toBe(false);
    expect(await balance()).toBe(1000);
  });

  it("starts a metered session, reserving the discounted per-minute rate", async () => {
    const { session, holdMinutes, practitioner } = await startChatSession(MEMBER_ID, PRAC_METERED);

    // 0 published reviews -> 30% review discount on the 100/min rate = 70/min,
    // no member discount. 1000 balance funds 14 minutes, so the hold is 980.
    expect(session.pricingModel).toBe("metered");
    expect(session.ratePerMinute).toBe(70);
    expect(session.fixedPrice).toBeNull();
    expect(holdMinutes).toBe(14);
    expect(practitioner.name).toBe("Metered Ji");
    expect(session.status).toBe("active");
    expect(session.startedAt).toBeInstanceOf(Date);
    expect(typeof session.ratePerMinute).toBe("number"); // numeric arrives as a string from pg

    expect(await balance()).toBe(20);
    expect(await lockHeld()).toBe(true);

    const messages = await listSessionMessages(session.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].senderType).toBe("system");
    expect(messages[0].body).toContain("70/min");
    expect(messages[0].createdAt).toBeInstanceOf(Date);
  });

  it("lets only one of two concurrent starts claim the lock", async () => {
    // Release the lock the previous test is holding, so this race starts clean.
    const existing = await getMemberActiveSession(MEMBER_ID);
    if (existing) await endChatSession(existing.id, "system");
    expect(await lockHeld()).toBe(false);

    // The lock is what stops a double-click from reserving two holds for one chat.
    // Unlike a read-then-write check, a unique-key insert serialises regardless of
    // timing: the loser blocks until the winner commits, then sees the conflict.
    const results = await Promise.allSettled([
      startChatSession(MEMBER_ID, PRAC_METERED),
      startChatSession(MEMBER_ID, PRAC_METERED),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(ChatSessionConflictError);

    // The loser must not have reserved a second hold.
    const { rows } = await query(`select count(*)::int as n from public.chat_sessions where member_id = $1 and status = 'active'`, [MEMBER_ID]);
    expect(rows[0].n).toBe(1);
  });

  it("finds the member's active session", async () => {
    const active = await getMemberActiveSession(MEMBER_ID);
    expect(active).not.toBeNull();
    expect(active?.memberId).toBe(MEMBER_ID);
    expect(active?.practitionerId).toBe(PRAC_METERED);
  });

  it("records messages in order", async () => {
    const session = await getMemberActiveSession(MEMBER_ID);
    if (!session) throw new Error("expected an active session");

    const sent = await sendMessage({ sessionId: session.id, senderType: "member", senderName: "Chat Test Member", body: "Namaste ji" });
    // This object is published to Ably and rendered by the client, so its keys
    // must be camelCase — an unmapped row would arrive as sender_type.
    expect(sent.sessionId).toBe(session.id);
    expect(sent.senderType).toBe("member");
    expect(sent.senderName).toBe("Chat Test Member");
    expect(sent.createdAt).toBeInstanceOf(Date);

    await sendMessage({ sessionId: session.id, senderType: "practitioner", senderName: "Metered Ji", body: "Namaste, bataiye" });

    const messages = await listSessionMessages(session.id);
    expect(messages).toHaveLength(3); // system start + the two above
    expect(messages.map((m) => m.body)).toEqual([messages[0].body, "Namaste ji", "Namaste, bataiye"]);
    const times = messages.map((m) => m.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("ends the session, captures the elapsed minutes and releases the lock", async () => {
    const session = await getMemberActiveSession(MEMBER_ID);
    if (!session) throw new Error("expected an active session");

    const before = await balance();
    const { rows: holdRows } = await query(`select amount from public.wallet_holds where id = $1`, [session.walletHoldId]);
    const heldAmount = Number(holdRows[0].amount);

    const ended = await endChatSession(session.id, "member");
    expect(ended.status).toBe("ended");
    expect(ended.endedAt).toBeInstanceOf(Date);
    // One minute elapsed at 70/min, capped at what the hold reserved.
    expect(ended.capturedAmount).toBe(70);

    // The invariant that matters: whatever was held but not spent comes back.
    expect(await balance()).toBe(before + (heldAmount - 70));
    expect(await lockHeld()).toBe(false);

    const messages = await listSessionMessages(session.id);
    expect(messages[messages.length - 1].body).toContain("Chat ended");
  });

  it("lets the member start again once the session has ended", async () => {
    expect(await lockHeld()).toBe(false);
    const { session } = await startChatSession(MEMBER_ID, PRAC_METERED);
    expect(session.status).toBe("active");
    await endChatSession(session.id, "member");
  });

  it("releases the lock when the start fails on insufficient balance", async () => {
    await query(`update public.wallets set balance = 0 where id = $1`, [MEMBER_ID]);
    await expect(startChatSession(MEMBER_ID, PRAC_METERED)).rejects.toBeInstanceOf(InsufficientBalanceError);
    // The failure path must not leave the member permanently unable to chat.
    expect(await lockHeld()).toBe(false);
    await query(`update public.wallets set balance = 1000 where id = $1`, [MEMBER_ID]);
  });

  it("charges a fixed price once for an AI-powered practitioner", async () => {
    const { session, holdMinutes } = await startChatSession(MEMBER_ID, PRAC_AI);
    expect(session.pricingModel).toBe("fixed");
    expect(session.fixedPrice).toBe(MARKETPLACE_SESSION_PRICE);
    expect(session.ratePerMinute).toBe(0);
    expect(holdMinutes).toBe(30);
    expect(await balance()).toBe(1000 - MARKETPLACE_SESSION_PRICE);

    // A fixed-price session captures the whole price however long it ran.
    const ended = await endChatSession(session.id, "member");
    expect(ended.capturedAmount).toBe(MARKETPLACE_SESSION_PRICE);
    expect(await balance()).toBe(1000 - MARKETPLACE_SESSION_PRICE);
  });

  it("404s an unknown session", async () => {
    await expect(getSessionOr404("no-such-session")).rejects.toBeInstanceOf(ChatSessionNotFoundError);
  });

  it("serves the admin and practitioner views with their joins", async () => {
    const { session } = await startChatSession(MEMBER_ID, PRAC_METERED);

    const forAdmin = await getSessionForAdmin(session.id);
    expect(forAdmin.memberName).toBe("Chat Test Member");
    expect(forAdmin.practitionerName).toBe("Metered Ji");

    const active = await listActiveSessionsForAdmin();
    const mine = active.find((row) => row.id === session.id);
    expect(mine?.memberName).toBe("Chat Test Member");
    expect(mine?.memberEmail).toBe("chat-itest@example.com");
    expect(mine?.practitionerName).toBe("Metered Ji");

    const forPractitioner = await listSessionsForPractitioner(PRAC_METERED);
    expect(forPractitioner.some((row) => row.id === session.id)).toBe(true);
    expect(forPractitioner[0].memberName).toBe("Chat Test Member");

    // Scoped lookups must not leak a session to another practitioner.
    const other = await listSessionsForPractitioner(PRAC_AI);
    expect(other.some((row) => row.id === session.id)).toBe(false);

    await endChatSession(session.id, "practitioner");
  });
});
