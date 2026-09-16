import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import { getMemberSubscriptionInSupabase, getSubscriptionInvoicesInSupabase } from "@/lib/subscriptions-supabase";
import { getMemberDiscountPercent, getMemberSubscription, getSubscriptionInvoices } from "@/lib/subscriptions";
import { seedPlansInSupabase } from "@/lib/plans-supabase";

/**
 * Integration coverage for the ported subscription data layer. Skipped unless
 * SUPABASE_DB_URL points at a reachable database carrying the migration schema.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/subscriptions-supabase.integration.test.ts
 *
 * The gate tests additionally need SUPABASE_CUTOVER=true; without it
 * subscriptions.ts takes the Firestore path and they are skipped rather than
 * failing for the wrong reason.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const MEMBER_ID = "member-sub-itest";
// A plan id the Firestore fallback could never return. An assertion on this value
// cannot pass by accident on the unported path — that is the whole point.
const MARKER_PLAN_ID = "plan-marker-subscriptions-itest";

async function cleanup() {
  // Children before parents: invoices reference subscriptions, subscriptions
  // reference both members and plans.
  await query(`delete from public.subscription_invoices where member_id = $1`, [MEMBER_ID]);
  await query(`delete from public.member_subscriptions where id = $1`, [MEMBER_ID]);
  await query(`delete from public.membership_plans where id = $1`, [MARKER_PLAN_ID]);
  await query(`delete from public.members where id = $1`, [MEMBER_ID]);
}

async function seedMember() {
  await query(
    `insert into public.members (id, name, email) values ($1, $2, $3)
     on conflict (id) do nothing`,
    [MEMBER_ID, "Integration Member", "member-sub-itest@example.test"],
  );
}

async function seedPlan(sessionDiscountPercent: number) {
  await seedPlansInSupabase([
    {
      key: "marker-sub-itest",
      name: "Marker Plan",
      tagline: "Exists only so the gate test can prove where the row came from",
      description: "Integration fixture.",
      priceMonthly: 499,
      priceYearly: 4999,
      currency: "INR",
      features: "Line one",
      sessionDiscountPercent,
      highlighted: false,
      active: true,
      sortOrder: 99,
    },
  ]);
  // seedPlansInSupabase keys off the plan's own key; force the id we look up by.
  await query(`update public.membership_plans set id = $1 where key = $2`, [MARKER_PLAN_ID, "marker-sub-itest"]);
}

async function seedSubscription(status: string) {
  await query(
    `insert into public.member_subscriptions
       (id, member_id, plan_id, billing_interval, status, current_period_start, current_period_end)
     values ($1, $2, $3, 'monthly', $4, now(), now() + interval '30 days')
     on conflict (id) do update set status = excluded.status, plan_id = excluded.plan_id`,
    [MEMBER_ID, MEMBER_ID, MARKER_PLAN_ID, status],
  );
}

describeDb("member subscriptions on Postgres", () => {
  beforeAll(async () => {
    await cleanup();
    await seedMember();
    await seedPlan(15);
    await seedSubscription("active");
  });

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("reads the subscription back with real Dates, not ISO strings", async () => {
    const row = await getMemberSubscriptionInSupabase(MEMBER_ID);
    expect(row).not.toBeNull();
    expect(row?.id).toBe(MEMBER_ID);
    expect(row?.memberId).toBe(MEMBER_ID);
    expect(row?.planId).toBe(MARKER_PLAN_ID);
    expect(row?.status).toBe("active");
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.currentPeriodEnd).toBeInstanceOf(Date);
    expect(row?.cancelAtPeriodEnd).toBe(false);
  });

  it("returns null rather than throwing for a member with no subscription", async () => {
    expect(await getMemberSubscriptionInSupabase("no-such-member-id")).toBeNull();
  });

  it("reads invoices with numeric amounts, not the strings node-postgres returns", async () => {
    await query(
      `insert into public.subscription_invoices
         (id, subscription_id, member_id, amount, subtotal, tax_amount, tax_rate, currency, status)
       values ('inv-sub-itest-1', $1, $2, 588.80, 499.00, 89.80, 18.000, 'INR', 'paid')`,
      [MEMBER_ID, MEMBER_ID],
    );
    const invoices = await getSubscriptionInvoicesInSupabase(MEMBER_ID);
    expect(invoices).toHaveLength(1);
    // These four are the assertion that catches a missing numericColumns entry.
    // Against strings the invoice total would concatenate instead of adding.
    expect(typeof invoices[0]?.amount).toBe("number");
    expect(typeof invoices[0]?.subtotal).toBe("number");
    expect(typeof invoices[0]?.taxAmount).toBe("number");
    expect(typeof invoices[0]?.taxRate).toBe("number");
    expect(invoices[0]?.amount).toBeCloseTo(588.8);
    expect(invoices[0]?.taxRate).toBeCloseTo(18);
    expect(invoices[0]?.createdAt).toBeInstanceOf(Date);
    await query(`delete from public.subscription_invoices where id = 'inv-sub-itest-1'`);
  });
});

describeCutover("subscriptions.ts routes to Postgres under cutover", () => {
  beforeAll(async () => {
    await cleanup();
    await seedMember();
    await seedPlan(15);
    await seedSubscription("active");
  });

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("returns the Postgres subscription, joined to the Postgres plan", async () => {
    const subscription = await getMemberSubscription(MEMBER_ID);
    expect(subscription).not.toBeNull();
    // The marker id cannot come from Firestore, so this proves which layer answered.
    expect(subscription?.planId).toBe(MARKER_PLAN_ID);
    expect(subscription?.plan.id).toBe(MARKER_PLAN_ID);
    expect(subscription?.plan.sessionDiscountPercent).toBe(15);
    expect(subscription?.createdAt).toBeInstanceOf(Date);
  });

  it("grants the plan discount while the subscription is active", async () => {
    expect(await getMemberDiscountPercent(MEMBER_ID)).toBe(15);
  });

  it("withholds the discount the moment the subscription is not active", async () => {
    // This is the money assertion: "created"/"halted" must not keep granting a
    // discount, which is exactly what the activeStatuses rule in subscriptions.ts
    // exists to prevent.
    await seedSubscription("halted");
    expect(await getMemberDiscountPercent(MEMBER_ID)).toBe(0);
    await seedSubscription("created");
    expect(await getMemberDiscountPercent(MEMBER_ID)).toBe(0);
  });

  it("returns 0 for a member who never subscribed", async () => {
    expect(await getMemberDiscountPercent("no-such-member-id")).toBe(0);
  });

  it("reads invoices through the gated function too", async () => {
    await query(
      `insert into public.subscription_invoices
         (id, subscription_id, member_id, amount, subtotal, tax_amount, tax_rate, currency, status)
       values ('inv-sub-itest-2', $1, $2, 588.80, 499.00, 89.80, 18.000, 'INR', 'paid')`,
      [MEMBER_ID, MEMBER_ID],
    );
    const invoices = await getSubscriptionInvoices(MEMBER_ID);
    expect(invoices).toHaveLength(1);
    expect(typeof invoices[0]?.amount).toBe("number");
    await query(`delete from public.subscription_invoices where id = 'inv-sub-itest-2'`);
  });
});
