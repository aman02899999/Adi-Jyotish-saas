import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";
import { claimInvoiceRefundInSupabase } from "@/lib/billing-supabase";
import {
  InvoiceConflictError,
  InvoiceNotFoundError,
  changeInvoiceOpenState,
  confirmInvoicePayment,
  getBookingForInvoice,
  getInvoiceDetail,
  getInvoiceById,
  getPaymentForOrder,
  getReusablePendingPayment,
  markInvoicePaid,
  recordPendingPayment,
  refundInvoice,
} from "@/lib/invoice-actions";

/**
 * Integration coverage for invoice actions on Postgres. Skipped unless
 * SUPABASE_DB_URL points at a reachable database carrying the migration schema,
 * and additionally needs SUPABASE_CUTOVER=true.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/invoice-actions.integration.test.ts
 *
 * The interesting cases are the two where real money moves twice if the
 * guard is wrong: two admins marking one invoice paid, and two admins refunding
 * it. Razorpay is not configured here, so `refundInvoice` on a razorpay payment
 * exercises the rollback path for free.
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

vi.mock("@/lib/razorpay", () => ({ getRazorpay: () => null }));

const MEMBER = "member-invact-itest";
const PRACTITIONER = "prac-invact-itest";
const SERVICE = "svc-invact-itest";
const BOOKING = "bk-invact-itest";
const INVOICE = "inv-invact-itest";
const PAYMENT = "pay-invact-itest";
const EMAIL = "invact-itest@example.test";

async function cleanup() {
  await query(`delete from public.payments where invoice_id = $1 or booking_id = $2`, [INVOICE, BOOKING]);
  await query(`delete from public.invoices where id = $1`, [INVOICE]);
  await query(`delete from public.bookings where id = $1`, [BOOKING]);
  await query(`delete from public.services where id = $1`, [SERVICE]);
  await query(`delete from public.practitioners where id = $1`, [PRACTITIONER]);
  await query(`delete from public.members where id = $1`, [MEMBER]);
}

/** @param invoiceStatus the state the invoice starts in, since several tests need
 * a paid or void one rather than an open one. */
async function seed(invoiceStatus = "open", paymentStatus = "succeeded", provider = "manual") {
  await cleanup();
  await query(`insert into public.members (id, name, email) values ($1, 'Invoice Member', $2)`, [MEMBER, EMAIL]);
  await query(`insert into public.services (id, title, slug, price, duration, active)
               values ($1, 'Kundli Reading', 'kundli-invact-itest', 1180, 60, true)`, [SERVICE]);
  await query(
    `insert into public.practitioners (id, name, slug, email, active, is_demo_account, chat_rate_per_minute)
     values ($1, 'Test Astrologer', 'astro-invact-itest', 'astro-invact-itest@example.test', true, false, 100)`,
    [PRACTITIONER],
  );
  await query(
    `insert into public.bookings
       (id, reference, service_id, service_title, service_price, service_duration, practitioner_id,
        practitioner_name, client_name, client_email, birth_date, birth_time, birth_place, scheduled_at,
        status, payment_status, created_at, updated_at)
     values ($1, 'JY-INVACT-1', $2, 'Kundli Reading', 1180, 60, $3, 'Test Astrologer', 'Asha Rao', $4,
             '1990-01-01', '06:30', 'Delhi', '2027-03-15T10:00:00Z', 'completed', 'unpaid', now(), now())`,
    [BOOKING, SERVICE, PRACTITIONER, EMAIL],
  );
  await query(
    `insert into public.invoices
       (id, number, booking_id, member_id, customer_name, customer_email, description, subtotal, tax_rate,
        tax_amount, amount, currency, status, due_at, paid_at, created_at, updated_at)
     values ($1, 'INV-2027-INVACT01', $2, $3, 'Asha Rao', $4, 'Kundli Reading', 1000, 18, 180, 1180, 'INR',
             $5, '2027-03-15T10:00:00Z', case when $5 = 'paid' then now() else null end, now(), now())`,
    [INVOICE, BOOKING, MEMBER, EMAIL, invoiceStatus],
  );
  if (paymentStatus) {
    await query(
      `insert into public.payments
         (id, invoice_id, booking_id, amount, currency, provider, status, payment_intent_id, paid_at,
          created_at, updated_at)
       values ($1, $2, $3, 1180, 'INR', $4, $5, $6,
               case when $5 = 'succeeded' then now() else null end, now(), now())`,
      [PAYMENT, INVOICE, BOOKING, provider, paymentStatus, provider === "razorpay" ? "pay_razorpay_itest" : null],
    );
  }
}

async function invoiceStatus() {
  const { rows } = await query(`select status from public.invoices where id = $1`, [INVOICE]);
  return rows[0].status;
}
async function paymentStatusOf() {
  const { rows } = await query(`select status from public.payments where id = $1`, [PAYMENT]);
  return rows[0].status;
}
async function bookingPaymentStatus() {
  const { rows } = await query(`select payment_status from public.bookings where id = $1`, [BOOKING]);
  return rows[0].payment_status;
}
async function paymentCount() {
  const { rows } = await query(`select count(*)::int as count from public.payments where invoice_id = $1`, [INVOICE]);
  return rows[0].count;
}

describeCutover("marking an invoice paid", () => {
  // No payment row: an open invoice has not been paid yet, so markInvoicePaid's
  // manual payment should be the only one.
  beforeEach(() => seed("open", ""));
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("pays the invoice, records a manual payment and pays the booking", async () => {
    await markInvoicePaid(INVOICE);
    expect(await invoiceStatus()).toBe("paid");
    expect(await bookingPaymentStatus()).toBe("paid");
    expect(await paymentCount()).toBe(1);

    const { rows } = await query(`select provider, status, amount from public.payments where invoice_id = $1`, [INVOICE]);
    expect(rows[0].provider).toBe("manual");
    expect(rows[0].status).toBe("succeeded");
    expect(Number(rows[0].amount)).toBe(1180);
  });

  it("refuses an invoice that is already paid, and one that is void", async () => {
    await markInvoicePaid(INVOICE);
    await expect(markInvoicePaid(INVOICE)).rejects.toThrow(/already paid/);
    expect(await paymentCount()).toBe(1);

    await query(`update public.invoices set status = 'void' where id = $1`, [INVOICE]);
    await expect(markInvoicePaid(INVOICE)).rejects.toThrow(InvoiceConflictError);
  });

  it("creates exactly one payment when many admins click at once", async () => {
    // Warm the pool first. Connections are opened lazily, so without this the
    // calls stagger while connecting and never overlap — the race stays closed
    // whether or not the lock exists.
    await Promise.all(Array.from({ length: 10 }, () => query(`select 1`)));

    // 20 concurrent calls, above the pool's 10 connections, so several really do
    // read the invoice before any of them writes. At 3 concurrent this test
    // passed with the row lock deleted — the calls serialised on pool contention
    // and the race never opened.
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => markInvoicePaid(INVOICE)),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    for (const attempt of attempts.filter((a) => a.status === "rejected")) {
      expect((attempt as PromiseRejectedResult).reason).toBeInstanceOf(InvoiceConflictError);
    }
    // The real assertion: without the row lock both readers see status 'open' and
    // both insert a payment, so the customer looks like they paid twice.
    expect(await paymentCount()).toBe(1);
  });


  it("throws InvoiceNotFoundError for an invoice that does not exist", async () => {
    await expect(markInvoicePaid("no-such-invoice")).rejects.toThrow(InvoiceNotFoundError);
  });
});

describeCutover("voiding and reopening an invoice", () => {
  beforeEach(() => seed("open", ""));
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("voids an open invoice and reopens a void one", async () => {
    await changeInvoiceOpenState(INVOICE, "open", "void");
    expect(await invoiceStatus()).toBe("void");
    await changeInvoiceOpenState(INVOICE, "void", "open");
    expect(await invoiceStatus()).toBe("open");
  });

  it("refuses to void an invoice that is not open", async () => {
    await query(`update public.invoices set status = 'paid' where id = $1`, [INVOICE]);
    await expect(changeInvoiceOpenState(INVOICE, "open", "void")).rejects.toThrow(/Only open invoices can be voided/);
    expect(await invoiceStatus()).toBe("paid");
  });
});

describeCutover("refunding an invoice", () => {
  beforeEach(() => seed("paid", "succeeded", "manual"));
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("refunds a manual payment and marks the booking refunded", async () => {
    await refundInvoice(INVOICE);
    expect(await invoiceStatus()).toBe("refunded");
    expect(await paymentStatusOf()).toBe("refunded");
    expect(await bookingPaymentStatus()).toBe("refunded");

    const { rows } = await query(`select refund_id from public.payments where id = $1`, [PAYMENT]);
    expect(String(rows[0].refund_id).startsWith("manual_")).toBe(true);
  });

  it("refuses to refund an invoice that was never paid", async () => {
    await query(`update public.invoices set status = 'open' where id = $1`, [INVOICE]);
    await expect(refundInvoice(INVOICE)).rejects.toThrow(/Only paid invoices can be refunded/);
  });

  it("refuses to refund when there is no succeeded payment", async () => {
    await query(`update public.payments set status = 'pending' where id = $1`, [PAYMENT]);
    await expect(refundInvoice(INVOICE)).rejects.toThrow(/refundable payment was not found/);
    // The claim must roll back rather than strand the invoice in refund_processing.
    expect(await invoiceStatus()).toBe("paid");
  });

  it("rolls the invoice back when the provider refund cannot be made", async () => {
    // getRazorpay() is mocked to null, so this is the real failure path: the
    // claim succeeded, the gateway call did not, and the invoice must be
    // collectable again instead of stuck in refund_processing.
    await query(`update public.payments set provider = 'razorpay', payment_intent_id = 'pay_razorpay_itest' where id = $1`, [PAYMENT]);
    await expect(refundInvoice(INVOICE)).rejects.toThrow(/Razorpay refund is unavailable/);
    expect(await invoiceStatus()).toBe("paid");
    expect(await paymentStatusOf()).toBe("succeeded");
    expect(await bookingPaymentStatus()).toBe("unpaid");
  });

  it("lets exactly one concurrent caller claim the refund", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () => refundInvoice(INVOICE)),
    );
    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    expect(succeeded).toHaveLength(1);
    for (const attempt of attempts.filter((a) => a.status === "rejected")) {
      expect((attempt as PromiseRejectedResult).reason).toBeInstanceOf(InvoiceConflictError);
    }
    expect(await invoiceStatus()).toBe("refunded");
    // One refund_id, written once.
    const { rows } = await query(`select refund_id from public.payments where invoice_id = $1`, [INVOICE]);
    expect(rows).toHaveLength(1);
  });
});

describeCutover("checkout and verify reads", () => {
  beforeEach(() => seed("open", "pending", "razorpay"));
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("finds a reusable pending payment by session id", async () => {
    await query(`update public.payments set provider_session_id = 'order_itest_reuse' where id = $1`, [PAYMENT]);
    const pending = await getReusablePendingPayment(INVOICE);
    expect(pending?.providerSessionId).toBe("order_itest_reuse");
    expect(pending?.createdAt).toBeInstanceOf(Date);

    const found = await getPaymentForOrder(INVOICE, "order_itest_reuse");
    expect(found?.id).toBe(PAYMENT);
    expect(await getPaymentForOrder(INVOICE, "order_not_there")).toBeNull();
  });

  it("records a pending payment for a new Razorpay order", async () => {
    await recordPendingPayment({
      invoiceId: INVOICE, bookingId: BOOKING, amount: 1180, currency: "INR", providerSessionId: "order_itest_new",
    });
    const { rows } = await query(
      `select provider, status, provider_session_id from public.payments where provider_session_id = $1`,
      ["order_itest_new"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe("razorpay");
    expect(rows[0].status).toBe("pending");
  });

  it("confirms a verified payment across payment, invoice and booking", async () => {
    await confirmInvoicePayment({ paymentId: PAYMENT, invoiceId: INVOICE, bookingId: BOOKING, paymentIntentId: "pay_itest_verified" });
    expect(await invoiceStatus()).toBe("paid");
    expect(await paymentStatusOf()).toBe("succeeded");
    expect(await bookingPaymentStatus()).toBe("paid");

    const { rows } = await query(`select payment_intent_id, paid_at from public.payments where id = $1`, [PAYMENT]);
    expect(rows[0].payment_intent_id).toBe("pay_itest_verified");
    expect(rows[0].paid_at).toBeInstanceOf(Date);
  });

  it("reads an invoice with its booking summary and payments", async () => {
    const detail = await getInvoiceDetail(INVOICE);
    expect(detail?.invoice.id).toBe(INVOICE);
    expect(detail?.booking.reference).toBe("JY-INVACT-1");
    expect(detail?.booking.status).toBe("completed");
    expect(detail?.booking.practitionerName).toBe("Test Astrologer");
    expect(detail?.booking.scheduledAt).toBeInstanceOf(Date);
    expect(detail?.payments.map((payment) => payment.id)).toEqual([PAYMENT]);

    expect(await getInvoiceDetail("no-such-invoice")).toBeNull();
    expect((await getInvoiceById(INVOICE))?.number).toBe("INV-2027-INVACT01");
    expect((await getBookingForInvoice(BOOKING))?.serviceTitle).toBe("Kundli Reading");
    expect(await getBookingForInvoice("no-such-booking")).toBeNull();
  });
});

describeCutover("refund claim connection use", () => {
  /**
   * The claim runs inside withTransaction, so it is holding one pooled client. An earlier version
   * looked the invoice up through getInvoiceByIdInSupabase on the not-claimed branch, which goes
   * through the pool and checks out a SECOND connection while the first is still held.
   *
   * The pool is max: 10. Ten concurrent claims on non-refundable invoices each hold a client and
   * wait for an eleventh that cannot exist, so every one blocks until connectionTimeoutMillis and
   * then fails with a timeout instead of the not_paid the caller is meant to get. Firing more
   * than the pool size at once is the only way to see it: a couple of sequential calls return
   * their connection between attempts and look perfectly healthy.
   */
  it("does not exhaust the pool when more claims than connections all miss", async () => {
    await seed("open");

    const attempts = 24;
    const results = await Promise.all(
      Array.from({ length: attempts }, () => claimInvoiceRefundInSupabase(INVOICE)),
    );

    // Every one must come back with the real reason, not a connection timeout.
    expect(results).toHaveLength(attempts);
    for (const result of results) {
      expect(result).toEqual({ ok: false, code: "not_paid" });
    }
  });

  it("still reports a missing invoice under the same pressure", async () => {
    await cleanup();
    const results = await Promise.all(
      Array.from({ length: 24 }, () => claimInvoiceRefundInSupabase(INVOICE)),
    );
    for (const result of results) {
      expect(result).toEqual({ ok: false, code: "invoice_not_found" });
    }
  });
});
