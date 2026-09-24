import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  buildMemberDataExportInSupabase,
  deleteMemberAccountInSupabase,
  getDeletionBlockersInSupabase,
} from "@/lib/account-deletion-supabase";
import { ANONYMIZED_NAME } from "@/lib/account-privacy";
import { closePgPool, query, queryModel } from "@/lib/postgres";
import type { MemberIdentity } from "@/lib/member-auth";

/**
 * Erasure is the one flow where a silent partial success is worse than a loud failure, and where
 * the damage is invisible until someone asks for their data back or an auditor asks where the
 * money went. These tests assert both halves of the policy on a real database: what must survive
 * a deletion, and what must not.
 *
 * Fixtures are prefixed and cleaned up by prefix only. An unscoped delete here would wipe the
 * other integration suites' rows — the hazard postgres.integration.test.ts documents, and the one
 * that made the CI integration job red on its first run.
 */
const describeDb = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

const P = "itest-del-";
const MEMBER_ID = `${P}member`;
const MEMBER_EMAIL = `${P}asha@example.com`;
const MEMBER: MemberIdentity = { id: MEMBER_ID, email: MEMBER_EMAIL } as MemberIdentity;

async function cleanup() {
  await query(`delete from public.chat_messages where session_id like $1`, [`${P}%`]);
  await query(`delete from public.chat_sessions where id like $1`, [`${P}%`]);
  await query(`delete from public.notifications where recipient_id = $1`, [MEMBER_ID]);
  await query(`delete from public.subscription_invoices where id like $1`, [`${P}%`]);
  await query(`delete from public.member_subscriptions where id like $1`, [`${P}%`]);
  await query(`delete from public.invoices where id like $1`, [`${P}%`]);
  await query(`delete from public.gift_cards where id like $1`, [`${P}%`]);
  await query(`delete from public.gemstone_orders where id like $1`, [`${P}%`]);
  await query(`delete from public.kundli_matches where id like $1`, [`${P}%`]);
  await query(`delete from public.journal_entries where id like $1`, [`${P}%`]);
  await query(`delete from public.bookings where id like $1`, [`${P}%`]);
  await query(`delete from public.wallet_entries where wallet_id like $1`, [`${P}%`]);
  await query(`delete from public.wallets where id like $1`, [`${P}%`]);
  await query(`delete from public.members where id = $1`, [MEMBER_ID]);
  await query(`delete from public.services where id like $1`, [`${P}%`]);
  await query(`delete from public.practitioners where id like $1`, [`${P}%`]);
  await query(`delete from public.membership_plans where id like $1`, [`${P}%`]);
  await query(`delete from public.audit_logs where entity_id = $1`, [MEMBER_ID]);
}

async function seed({ walletBalance = 0, chatStatus = "ended" } = {}) {
  await cleanup();
  await query(`insert into public.members (id, name, email) values ($1,'Asha',$2)`, [MEMBER_ID, MEMBER_EMAIL]);
  await query(`insert into public.practitioners (id, name, slug, email) values ($1,'Guru',$2,$3)`,
    [`${P}prac`, `${P}guru`, `${P}g@example.com`]);
  await query(`insert into public.services (id, title, slug) values ($1,'Kundli',$2)`, [`${P}svc`, `${P}kundli`]);
  await query(`insert into public.wallets (id, member_id, balance) values ($1,$1,$2)`, [MEMBER_ID, walletBalance]);
  await query(
    `insert into public.bookings (id, reference, member_id, service_id, service_title, practitioner_id,
       practitioner_name, client_name, client_email, client_phone, birth_date, birth_place, notes,
       service_price, scheduled_at)
     values ($1,$1,$2,$3,'Kundli',$4,'Guru','Asha',$5,'+919999999999','1990-04-12','Jaipur',
             'private note',1500, now())`,
    [`${P}bk`, MEMBER_ID, `${P}svc`, `${P}prac`, MEMBER_EMAIL]);
  await query(
    `insert into public.invoices (id, number, booking_id, member_id, customer_name, customer_email, amount)
     values ($1,$1,$2,$3,'Asha',$4,1500)`,
    [`${P}inv`, `${P}bk`, MEMBER_ID, MEMBER_EMAIL]);
  await query(`insert into public.chat_sessions (id, member_id, practitioner_id, status, captured_amount)
               values ($1,$2,$3,$4,2500)`, [`${P}cs`, MEMBER_ID, `${P}prac`, chatStatus]);
  await query(`insert into public.chat_messages (id, session_id, sender_type, body)
               values ($1,$2,'member','my private question')`, [`${P}msg`, `${P}cs`]);
  await query(`insert into public.membership_plans (id, key, name, price_monthly, price_yearly, currency)
               values ($1,$1,'Plus',499,4990,'INR')`, [`${P}plan`]);
  await query(`insert into public.member_subscriptions (id, member_id, plan_id, status)
               values ($1,$2,$3,'active')`, [`${P}ms`, MEMBER_ID, `${P}plan`]);
  await query(`insert into public.subscription_invoices (id, subscription_id, member_id, amount)
               values ($1,$2,$3,4990)`, [`${P}si`, `${P}ms`, MEMBER_ID]);
  await query(`insert into public.kundli_matches (id, member_id, name_a, birth_date_a, birth_place_a)
               values ($1,$2,'Asha','1990-04-12','Jaipur')`, [`${P}km`, MEMBER_ID]);
  await query(`insert into public.journal_entries (id, member_id, entry_date, mood, note)
               values ($1,$2, current_date, 'calm', 'dear diary')`, [`${P}je`, MEMBER_ID]);
  await query(`insert into public.gift_cards (id, code, buyer_id, buyer_name, amount, recipient_name, message)
               values ($1,$1,$2,'Asha',1000,'Rohan','happy birthday')`, [`${P}gc`, MEMBER_ID]);
  await query(`insert into public.notifications (id, recipient_type, recipient_id, type, title)
               values ($1,'member',$2,'info','Your reading is ready')`, [`${P}nt`, MEMBER_ID]);
}

describeDb("account erasure on Postgres", () => {
  beforeEach(async () => { await seed(); });
  afterAll(async () => { await cleanup(); await closePgPool(); });

  describe("blockers", () => {
    it("is clear for a member with an empty wallet and no live chat", async () => {
      expect(await getDeletionBlockersInSupabase(MEMBER)).toEqual([]);
    });

    it("blocks while the wallet still holds money", async () => {
      await seed({ walletBalance: 250 });
      expect((await getDeletionBlockersInSupabase(MEMBER)).join(" ")).toContain("wallet still holds");
    });

    it("reads the balance as a number, not the string numeric() returns", async () => {
      // A string comparison would make "0.00" > 0 truthy and block every deletion.
      await seed({ walletBalance: 0 });
      expect(await getDeletionBlockersInSupabase(MEMBER)).toEqual([]);
    });

    it("blocks during a live chat session", async () => {
      await seed({ chatStatus: "active" });
      expect((await getDeletionBlockersInSupabase(MEMBER)).join(" ")).toContain("live chat session");
    });
  });

  describe("export", () => {
    it("returns the member's own records", async () => {
      const bundle = await buildMemberDataExportInSupabase(MEMBER);
      expect(bundle.format).toBe("adi-jyotish-guru/member-data-export.v1");
      expect((bundle.bookings as unknown[])).toHaveLength(1);
      expect((bundle.invoices as unknown[])).toHaveLength(1);
      expect((bundle.journalEntries as unknown[])).toHaveLength(1);
      expect((bundle.kundliMatches as unknown[])).toHaveLength(1);
      expect((bundle.chatSessions as unknown[])).toHaveLength(1);
      expect((bundle.notifications as unknown[])).toHaveLength(1);
      expect((bundle.giftCardsPurchased as unknown[])).toHaveLength(1);
    });

    it("never includes TOTP secrets or the payment-bypass flag", async () => {
      const bundle = await buildMemberDataExportInSupabase(MEMBER);
      const serialized = JSON.stringify(bundle);
      for (const secret of ["totpSecret", "totp_secret", "totpBackupCodes", "paymentBypass", "payment_bypass"]) {
        expect(serialized).not.toContain(secret);
      }
    });
  });

  describe("deletion", () => {
    beforeEach(async () => { await deleteMemberAccountInSupabase(MEMBER); });

    it("removes the member row", async () => {
      expect(await queryModel(`select id from public.members where id = $1`, [MEMBER_ID])).toBeNull();
    });

    it("keeps the practitioner's earnings and drops the transcript", async () => {
      const session = await queryModel<{ capturedAmount: string; memberId: string | null }>(
        `select captured_amount as "capturedAmount", member_id as "memberId" from public.chat_sessions where id = $1`,
        [`${P}cs`]);
      expect(session).not.toBeNull();
      expect(Number(session!.capturedAmount)).toBe(2500);
      expect(session!.memberId).toBeNull();
      expect(await queryModel(`select id from public.chat_messages where id = $1`, [`${P}msg`])).toBeNull();
    });

    it("keeps the subscription invoice although the subscription itself goes", async () => {
      const si = await queryModel<{ amount: string }>(`select amount from public.subscription_invoices where id = $1`, [`${P}si`]);
      expect(Number(si?.amount)).toBe(4990);
      expect(await queryModel(`select id from public.member_subscriptions where id = $1`, [`${P}ms`])).toBeNull();
    });

    it("scrubs the booking but keeps it for the practitioner's earnings and GST", async () => {
      const b = await queryModel<Record<string, string | null>>(
        `select client_name, client_email, client_phone, birth_place, notes, member_id from public.bookings where id = $1`,
        [`${P}bk`]);
      expect(b).not.toBeNull();
      expect(b!.clientName).toBe(ANONYMIZED_NAME);
      expect(b!.clientEmail).not.toBe(MEMBER_EMAIL);
      expect(b!.clientPhone).toBeNull();
      expect(b!.birthPlace).toBe("");
      expect(b!.notes).toBeNull();
      expect(b!.memberId).toBeNull();
    });

    it("keeps the invoice and its amount, scrubbed", async () => {
      const inv = await queryModel<Record<string, string | null>>(
        `select customer_name, customer_email, amount, member_id from public.invoices where id = $1`, [`${P}inv`]);
      expect(inv!.customerName).toBe(ANONYMIZED_NAME);
      expect(inv!.customerEmail).not.toBe(MEMBER_EMAIL);
      expect(Number(inv!.amount)).toBe(1500);
      expect(inv!.memberId).toBeNull();
    });

    it("gives the booking and its invoice the same anonymized email, so the join survives", async () => {
      const b = await queryModel<{ e: string }>(`select client_email as e from public.bookings where id = $1`, [`${P}bk`]);
      const i = await queryModel<{ e: string }>(`select customer_email as e from public.invoices where id = $1`, [`${P}inv`]);
      expect(b!.e).toBe(i!.e);
    });

    it("erases the birth data the member asked to have erased", async () => {
      expect(await queryModel(`select id from public.kundli_matches where id = $1`, [`${P}km`])).toBeNull();
      expect(await queryModel(`select id from public.journal_entries where id = $1`, [`${P}je`])).toBeNull();
    });

    it("scrubs the gift card but leaves it redeemable", async () => {
      const gc = await queryModel<Record<string, string | null>>(
        `select buyer_name, recipient_name, message, buyer_id, amount from public.gift_cards where id = $1`, [`${P}gc`]);
      expect(gc).not.toBeNull();
      expect(gc!.buyerName).toBe(ANONYMIZED_NAME);
      expect(gc!.recipientName).toBe("a friend");
      expect(gc!.message).toBe("");
      expect(gc!.buyerId).toBeNull();
      expect(Number(gc!.amount)).toBe(1000);
    });

    it("deletes member notifications, which no foreign key would reach", async () => {
      expect(await queryModel(`select id from public.notifications where id = $1`, [`${P}nt`])).toBeNull();
    });

    it("records the deletion in the audit log", async () => {
      const log = await queryModel<{ action: string }>(
        `select action from public.audit_logs where entity_id = $1`, [MEMBER_ID]);
      expect(log?.action).toBe("member.self_deleted");
    });
  });
});
