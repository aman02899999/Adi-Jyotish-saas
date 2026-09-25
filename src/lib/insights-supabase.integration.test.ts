import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * The admin Overview / Insights numbers and experiment counters on Postgres. Until this port both
 * read and wrote Firestore only, so after cutover the dashboards would have frozen at the
 * cutover-day numbers and the onboarding experiment would have stopped counting. Needs a migrated
 * database and SUPABASE_CUTOVER=true.
 */
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));

const { getAnalytics } = await import("@/lib/analytics");
const { getExperimentReport, recordExperimentConversion, recordExperimentImpression } = await import("@/lib/experiments");

const P = "insights_itest_";
const KEY = "dashboard-onboarding-cta";

async function cleanup() {
  await query(`delete from public.bookings where id like 'insights\\_itest\\_%'`);
  await query(`delete from public.services where id like 'insights\\_itest\\_%'`);
  await query(`delete from public.members where id like 'insights\\_itest\\_%'`);
  await query(`delete from public.practitioners where id like 'insights\\_itest\\_%'`);
  await query(`delete from public.experiments where id = $1`, [KEY]);
}

async function addBooking(id: string, opts: { price: number; paid: boolean; status: string; createdAt: string; scheduledAt: string }) {
  await query(
    `insert into public.bookings (id, reference, service_id, service_title, service_price, service_duration, practitioner_id, practitioner_name,
       client_name, client_email, birth_date, birth_time, birth_place, scheduled_at, status, payment_status, created_at)
     values ($1, $1, '${P}svc', 'Insights Reading', $2, 30, '${P}prac', 'P', 'Asha', 'asha@example.test', '1990-01-01', '10:00', 'Jaipur', $3, $4, $5, $6)`,
    [id, opts.price, opts.scheduledAt, opts.status, opts.paid ? "paid" : "unpaid", opts.createdAt],
  );
}

describeCutover("insights on Postgres", () => {
  beforeEach(async () => {
    await cleanup();
    await query(`insert into public.practitioners (id, name, slug, email, active) values ('${P}prac', 'P', '${P}prac', '${P}prac@example.test', true)`);
    await query(`insert into public.services (id, slug, title, category, description, price, duration, active) values ('${P}svc', '${P}svc', 'Insights Reading', 'T', 'd', 1500, 30, true)`);
  });
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("counts this period's bookings, revenue, members and the unpaid forecast", async () => {
    const before = await getAnalytics("30d");
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await addBooking(`${P}paid`, { price: 2100.5, paid: true, status: "completed", createdAt: hourAgo, scheduledAt: hourAgo });
    await addBooking(`${P}unpaid`, { price: 900, paid: false, status: "confirmed", createdAt: hourAgo, scheduledAt: nextWeek });
    await addBooking(`${P}old`, { price: 5000, paid: true, status: "completed", createdAt: new Date(Date.now() - 45 * 86_400_000).toISOString(), scheduledAt: hourAgo });
    await query(`insert into public.members (id, name, email, plan, active, onboarding_complete) values ('${P}m', 'M', '${P}m@example.test', 'premium', true, true)`);

    const after = await getAnalytics("30d");
    expect(after.metrics.bookings - before.metrics.bookings).toBe(2);
    // Prices are numeric in Postgres; a string here would concatenate instead of add.
    expect(after.metrics.revenue - before.metrics.revenue).toBeCloseTo(2100.5);
    expect(after.metrics.lifetimeRevenue - before.metrics.lifetimeRevenue).toBeCloseTo(7100.5);
    expect(after.metrics.forecast - before.metrics.forecast).toBe(900);
    expect(after.metrics.newMembers - before.metrics.newMembers).toBe(1);
    expect(after.plans.find((p) => p.plan === "premium")!.count - before.plans.find((p) => p.plan === "premium")!.count).toBe(1);
    expect(after.topServices.find((s) => s.title === "Insights Reading")).toMatchObject({ bookings: 2, completed: 1 });
  });

  it("lists the most recently created bookings first", async () => {
    // Created order is the reverse of appointment order, so sorting by the wrong date shows.
    // Both are created "in the future": the suites share one database, and a booking another
    // suite made seconds ago must not be able to sort between them.
    const inAnHour = Date.now() + 3_600_000;
    await addBooking(`${P}older`, { price: 100, paid: true, status: "confirmed", createdAt: new Date(inAnHour).toISOString(), scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });
    await addBooking(`${P}newest`, { price: 100, paid: true, status: "confirmed", createdAt: new Date(inAnHour + 1000).toISOString(), scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await getAnalytics("30d")).recentBookings.slice(0, 2).map((b) => b.id)).toEqual([`${P}newest`, `${P}older`]);
  });

  it("counts every one of many concurrent impressions, and conversions separately", async () => {
    await Promise.all(Array.from({ length: 30 }, () => recordExperimentImpression(KEY, "control")));
    await Promise.all(Array.from({ length: 3 }, () => recordExperimentConversion(KEY, "control")));
    await recordExperimentImpression(KEY, "get-my-chart");

    const report = await getExperimentReport(KEY);
    expect(report.variants).toEqual([
      { variant: "control", impressions: 30, conversions: 3, conversionRate: 0.1 },
      { variant: "get-my-chart", impressions: 1, conversions: 0, conversionRate: 0 },
    ]);
    expect(report.recommendation).toContain("Not enough data yet (31 impressions");
  });
});
