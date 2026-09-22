import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import { splitGstInclusive } from "@/lib/gst";
import {
  backfillInvoices,
  ensureInvoiceForBooking,
  getAdminBilling,
  getMemberBilling,
  type BookingForInvoice,
} from "@/lib/billing";

/**
 * Integration coverage for invoicing on Postgres. Skipped unless SUPABASE_DB_URL
 * points at a reachable database carrying the migration schema, and additionally
 * needs SUPABASE_CUTOVER=true.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/billing-supabase.integration.test.ts
 *
 * backfillInvoicesInSupabase reproduces the invoice-number derivation and the
 * GST split in SQL. Those two are the interesting assertions here: the tests
 * compare the database's output against `splitGstInclusive` and against the
 * `invoiceNumber` format, so a drift between the TypeScript rule and the SQL
 * rule fails rather than silently mis-invoicing.
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const GST_RATE = 18;

// getStudioSettings is wrapped in unstable_cache, which needs Next's incremental
// cache and throws outside a request. billing.ts only reads gstRate/currency.
vi.mock("@/lib/studio-settings", () => ({
  getStudioSettings: async () => ({ gstRate: GST_RATE, currency: "INR", timezone: "Asia/Kolkata" }),
}));

const MEMBER = "member-billing-itest";
const OTHER_MEMBER = "member-billing-other-itest";
const PRACTITIONER = "prac-billing-itest";
const SERVICE = "svc-billing-itest";
const EMAIL = "billing-itest@example.test";
const OTHER_EMAIL = "billing-other-itest@example.test";

const BOOKING_A = "bk-billing-aaaa-itest";
const BOOKING_B = "bk-billing-bbbb-itest";
const BOOKING_C = "bk-billing-cccc-itest";
// Prices chosen so the GST division is NOT a whole number: 1004/1.18 = 850.847,
// 999/1.18 = 846.61, 1234/1.18 = 1045.76. The seeded 1180/590/2360 all divide
// evenly by 1.18, so they cannot tell `round` from `trunc` — a backfill that
// truncated instead of rounding passed the whole suite on those numbers.
const AWKWARD = [
  { id: "bk-billing-awk1-itest", price: 1004 },
  { id: "bk-billing-awk2-itest", price: 999 },
  { id: "bk-billing-awk3-itest", price: 1234 },
];
// Only the bookings the shared seed creates. The awkward ones are inserted by
// the test that needs them.
const ALL_BOOKINGS = [BOOKING_A, BOOKING_B, BOOKING_C];
const AWKWARD_IDS = AWKWARD.map((row) => row.id);

async function cleanup() {
  const every = [...ALL_BOOKINGS, ...AWKWARD_IDS];
  await query(`delete from public.payments where booking_id = any($1::text[])`, [every]);
  await query(`delete from public.invoices where booking_id = any($1::text[])`, [every]);
  await query(`delete from public.invoices where id = any($1::text[])`, [every]);
  await query(`delete from public.bookings where id = any($1::text[])`, [every]);
  await query(`delete from public.services where id = $1`, [SERVICE]);
  await query(`delete from public.practitioners where id = $1`, [PRACTITIONER]);
  await query(`delete from public.members where id in ($1, $2)`, [MEMBER, OTHER_MEMBER]);
}

/** bookings.scheduled_at and created_at are set explicitly so the invoice number,
 * which embeds the creation year, is predictable. */
async function seedBooking(id: string, email: string, price: number, paymentStatus: string, year: number) {
  await query(
    `insert into public.bookings
       (id, reference, service_id, service_title, service_price, service_duration, practitioner_id,
        practitioner_name, client_name, client_email, birth_date, birth_time, birth_place, scheduled_at,
        status, payment_status, created_at, updated_at)
     values ($1, $2, $3, 'Kundli Reading', $4, 60, $5, 'Test Astrologer', 'Asha Rao', $6,
             '1990-01-01', '06:30', 'Delhi', $7::timestamptz, 'completed', $8, $7::timestamptz, $7::timestamptz)`,
    [id, `JY-${id}`, SERVICE, price, PRACTITIONER, email, `${year}-03-15T10:00:00Z`, paymentStatus],
  );
}

async function seed() {
  await cleanup();
  await query(`insert into public.members (id, name, email) values ($1, 'Bill Member', $2), ($3, 'Other', $4)`, [
    MEMBER, EMAIL, OTHER_MEMBER, OTHER_EMAIL,
  ]);
  await query(`insert into public.services (id, title, slug, price, duration, active)
               values ($1, 'Kundli Reading', 'kundli-billing-itest', 1100, 60, true)`, [SERVICE]);
  await query(
    `insert into public.practitioners (id, name, slug, email, active, is_demo_account, chat_rate_per_minute)
     values ($1, 'Test Astrologer', 'test-astrologer-billing-itest', 'astro-billing-itest@example.test', true, false, 100)`,
    [PRACTITIONER],
  );
  await seedBooking(BOOKING_A, EMAIL, 1180, "paid", 2027);
  await seedBooking(BOOKING_B, EMAIL, 590, "unpaid", 2027);
  await seedBooking(BOOKING_C, OTHER_EMAIL, 2360, "refunded", 2026);
}

function bookingFor(id: string, overrides: Partial<BookingForInvoice> = {}): BookingForInvoice {
  return {
    id,
    clientName: "Asha Rao",
    clientEmail: EMAIL,
    serviceTitle: "Kundli Reading",
    servicePrice: 1180,
    paymentStatus: "paid",
    scheduledAt: new Date("2027-03-15T10:00:00Z"),
    createdAt: new Date("2027-03-01T00:00:00Z"),
    updatedAt: new Date("2027-03-02T00:00:00Z"),
    ...overrides,
  };
}

describeCutover("invoice creation on Postgres", () => {
  beforeEach(seed);
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("creates one invoice per booking, keyed by the booking id", async () => {
    const invoice = await ensureInvoiceForBooking(bookingFor(BOOKING_A), MEMBER);
    expect(invoice.id).toBe(BOOKING_A);
    expect(invoice.bookingId).toBe(BOOKING_A);
    expect(invoice.memberId).toBe(MEMBER);
    expect(invoice.currency).toBe("INR");
    expect(invoice.createdAt).toBeInstanceOf(Date);

    const { rows } = await query(`select count(*)::int as count from public.invoices where booking_id = $1`, [BOOKING_A]);
    expect(rows[0].count).toBe(1);
  });

  it("is idempotent: a second call returns the same row unchanged", async () => {
    const first = await ensureInvoiceForBooking(bookingFor(BOOKING_A), MEMBER);
    // Different price on the second call must NOT rewrite the invoice.
    const second = await ensureInvoiceForBooking(bookingFor(BOOKING_A, { servicePrice: 9999 }), MEMBER);
    expect(second.id).toBe(first.id);
    expect(second.number).toBe(first.number);
    expect(second.amount).toBe(first.amount);
    expect(second.amount).toBe(1180);
  });

  it("splits GST the same way splitGstInclusive does", async () => {
    const invoice = await ensureInvoiceForBooking(bookingFor(BOOKING_A), MEMBER);
    const expected = splitGstInclusive(1180, GST_RATE);
    expect(invoice.subtotal).toBe(expected.subtotal);
    expect(invoice.taxAmount).toBe(expected.taxAmount);
    expect(invoice.taxRate).toBe(GST_RATE);
    // The inclusive total is preserved: subtotal + tax == amount.
    expect(invoice.subtotal + invoice.taxAmount).toBe(invoice.amount);
  });

  it("derives the invoice number from the booking id and creation year", async () => {
    const invoice = await ensureInvoiceForBooking(bookingFor(BOOKING_A), MEMBER);
    // invoiceNumber strips non-alphanumerics, takes the last 8, uppercases, pads to 8.
    const suffix = BOOKING_A.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase().padStart(8, "0");
    expect(invoice.number).toBe(`INV-2027-${suffix}`);
  });

  it("maps the booking's payment status onto the invoice status", async () => {
    expect((await ensureInvoiceForBooking(bookingFor(BOOKING_A, { paymentStatus: "paid" }), MEMBER)).status).toBe("paid");
    expect((await ensureInvoiceForBooking(bookingFor(BOOKING_B, { paymentStatus: "unpaid" }), MEMBER)).status).toBe("open");
    expect((await ensureInvoiceForBooking(bookingFor(BOOKING_C, { paymentStatus: "refunded", clientEmail: OTHER_EMAIL }), OTHER_MEMBER)).status).toBe("refunded");
  });

  it("records paidAt only for a paid booking", async () => {
    const paid = await ensureInvoiceForBooking(bookingFor(BOOKING_A, { paymentStatus: "paid" }), MEMBER);
    expect(paid.paidAt).toBeInstanceOf(Date);
    const unpaid = await ensureInvoiceForBooking(bookingFor(BOOKING_B, { paymentStatus: "unpaid" }), MEMBER);
    expect(unpaid.paidAt).toBeNull();
  });

  it("creates exactly one invoice when two callers race on the same booking", async () => {
    const results = await Promise.all([
      ensureInvoiceForBooking(bookingFor(BOOKING_A), MEMBER),
      ensureInvoiceForBooking(bookingFor(BOOKING_A), MEMBER),
      ensureInvoiceForBooking(bookingFor(BOOKING_A), MEMBER),
    ]);
    expect(new Set(results.map((invoice) => invoice.id)).size).toBe(1);
    expect(new Set(results.map((invoice) => invoice.number)).size).toBe(1);

    const { rows } = await query(`select count(*)::int as count from public.invoices where booking_id = $1`, [BOOKING_A]);
    expect(rows[0].count).toBe(1);
  });
});

describeCutover("invoice backfill on Postgres", () => {
  beforeEach(seed);
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("creates an invoice for every booking that lacks one", async () => {
    await backfillInvoices();
    const { rows } = await query(
      `select booking_id from public.invoices where booking_id = any($1::text[]) order by booking_id`,
      [ALL_BOOKINGS],
    );
    expect(rows.map((row) => row.booking_id)).toEqual([...ALL_BOOKINGS].sort());
  });

  it("matches the TypeScript invoice number and GST split for every row", async () => {
    await backfillInvoices();
    const { rows } = await query(
      `select id, number, subtotal, tax_amount, amount, status from public.invoices
        where booking_id = any($1::text[])`,
      [ALL_BOOKINGS],
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const price = Number(row.amount);
      const expected = splitGstInclusive(price, GST_RATE);
      expect(Number(row.subtotal)).toBe(expected.subtotal);
      expect(Number(row.tax_amount)).toBe(expected.taxAmount);
      // Same derivation as invoiceNumber(), applied to the seeded created_at year.
      const year = row.id === BOOKING_C ? 2026 : 2027;
      const suffix = String(row.id).replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase().padStart(8, "0");
      expect(row.number).toBe(`INV-${year}-${suffix}`);
    }
  });

  it("is idempotent and never duplicates an invoice", async () => {
    await backfillInvoices();
    const first = await query(`select count(*)::int as count from public.invoices`);
    await backfillInvoices();
    await backfillInvoices();
    const after = await query(`select count(*)::int as count from public.invoices`);
    expect(after.rows[0].count).toBe(first.rows[0].count);
  });

  it("leaves an invoice created by ensureInvoiceForBooking alone", async () => {
    const manual = await ensureInvoiceForBooking(bookingFor(BOOKING_A), MEMBER);
    await backfillInvoices();
    const { rows } = await query(`select number, amount from public.invoices where id = $1`, [BOOKING_A]);
    expect(rows).toHaveLength(1);
    expect(rows[0].number).toBe(manual.number);
  });

  it("resolves the member from the booking's client email", async () => {
    await backfillInvoices();
    const { rows } = await query(
      `select id, member_id from public.invoices where booking_id = any($1::text[]) order by booking_id`,
      [ALL_BOOKINGS],
    );
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.member_id]));
    expect(byId[BOOKING_A]).toBe(MEMBER);
    expect(byId[BOOKING_C]).toBe(OTHER_MEMBER);
  });
});

describeCutover("the SQL GST split agrees with splitGstInclusive", () => {
  beforeEach(seed);
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("rounds the same way the TypeScript rule does on amounts that do not divide evenly", async () => {
    for (const row of AWKWARD) {
      await seedBooking(row.id, EMAIL, row.price, "unpaid", 2027);
      // Guard the premise: if these amounts ever stop having a fractional
      // subtotal, the test below proves nothing and needs new numbers.
      const expected = splitGstInclusive(row.price, GST_RATE);
      expect(Number.isInteger(row.price / (1 + GST_RATE / 100))).toBe(false);
      expect(Math.trunc(row.price / (1 + GST_RATE / 100))).not.toBe(expected.subtotal);
    }

    await backfillInvoices();

    for (const row of AWKWARD) {
      const { rows } = await query(
        `select subtotal, tax_amount, amount from public.invoices where booking_id = $1`,
        [row.id],
      );
      expect(rows).toHaveLength(1);
      const expected = splitGstInclusive(row.price, GST_RATE);
      expect(Number(rows[0].subtotal)).toBe(expected.subtotal);
      expect(Number(rows[0].tax_amount)).toBe(expected.taxAmount);
      expect(Number(rows[0].amount)).toBe(row.price);
    }
  });
});

describeCutover("billing reads on Postgres", () => {
  beforeEach(seed);
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("attaches the booking reference and payments to each invoice", async () => {
    await backfillInvoices();
    await query(
      `insert into public.payments (id, invoice_id, booking_id, amount, currency, provider, status, created_at, updated_at)
       values ('pay-billing-1', $1, $1, 1180, 'INR', 'razorpay', 'captured', now() - interval '2 hours', now()),
              ('pay-billing-2', $1, $1, 1180, 'INR', 'razorpay', 'refunded', now() - interval '1 hour', now())`,
      [BOOKING_A],
    );

    const rows = await getAdminBilling();
    const invoice = rows.find((row) => row.id === BOOKING_A);
    expect(invoice).toBeDefined();
    expect(invoice?.bookingReference).toBe(`JY-${BOOKING_A}`);
    expect(invoice?.bookingStatus).toBe("completed");
    expect(invoice?.practitionerName).toBe("Test Astrologer");
    expect(invoice?.scheduledAt).toBeInstanceOf(Date);
    // Newest first.
    expect(invoice?.payments.map((payment) => payment.id)).toEqual(["pay-billing-2", "pay-billing-1"]);
    expect(typeof invoice?.payments[0]?.amount).toBe("number");
  });

  it("falls back to Archived when the booking is gone", async () => {
    await backfillInvoices();
    await query(`delete from public.bookings where id = $1`, [BOOKING_B]);
    const rows = await getAdminBilling();
    const orphan = rows.find((row) => row.id === BOOKING_B);
    expect(orphan?.bookingReference).toBe("Archived");
    expect(orphan?.bookingStatus).toBe("archived");
    expect(orphan?.practitionerName).toBeNull();
  });

  it("scopes the member list to that member's own invoices", async () => {
    await backfillInvoices();
    const mine = await getMemberBilling(MEMBER, EMAIL);
    expect(mine.map((row) => row.id).sort()).toEqual([BOOKING_A, BOOKING_B].sort());
    expect(mine.every((row) => row.memberId === MEMBER)).toBe(true);

    const theirs = await getMemberBilling(OTHER_MEMBER, OTHER_EMAIL);
    expect(theirs.map((row) => row.id)).toEqual([BOOKING_C]);
  });

  it("filters on member id OR customer email, not AND", async () => {
    await backfillInvoices();
    // Stated explicitly because it reads like a security check and is not one.
    // The predicate is an OR, unchanged from the Firestore version: an invoice
    // matches when EITHER the member id or the customer email lines up, so a
    // caller supplying someone else's email but its own member id still sees the
    // row. Both call sites pass the signed-in member's own id and email
    // (dashboard/billing/page.tsx and api/member/invoices/route.ts), so the loose
    // branch is not reachable with a foreign email — but a future caller that
    // takes the email from a query string would make it reachable.
    const rows = await getMemberBilling(MEMBER, OTHER_EMAIL);
    expect(rows.map((row) => row.id)).toEqual([BOOKING_C]);
    expect(rows[0].memberId).toBe(OTHER_MEMBER);
  });
});
