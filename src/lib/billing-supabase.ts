import "server-only";

import { randomUUID } from "node:crypto";

import { query, withTransaction } from "@/lib/postgres";

/**
 * Postgres data access for invoices and payments.
 *
 * Data access only. The invoice-number derivation, the GST split and the
 * booking-status → invoice-status mapping stay in `billing.ts` so both providers
 * compute them identically.
 *
 * `invoices.id` IS the booking id — a booking has exactly one invoice — which
 * makes "does this invoice exist" the idempotency check, the same trick the
 * Firestore version used with `ref.create()`.
 */

export type InvoiceRow = {
  id: string;
  number: string;
  bookingId: string;
  memberId: string | null;
  customerName: string;
  customerEmail: string;
  description: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  amount: number;
  currency: string;
  status: string;
  dueAt: Date;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentRow = {
  id: string;
  invoiceId: string;
  bookingId: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  providerSessionId: string | null;
  paymentIntentId: string | null;
  refundId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const INVOICE_COLUMNS = `
  id, number, booking_id, member_id, customer_name, customer_email::text as customer_email,
  description, subtotal, tax_rate, tax_amount, amount, currency, status, due_at, paid_at,
  created_at, updated_at`;

type InvoiceSqlRow = {
  id: string;
  number: string | null;
  booking_id: string | null;
  member_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  description: string | null;
  subtotal: string | number | null;
  tax_rate: string | number | null;
  tax_amount: string | number | null;
  amount: string | number | null;
  currency: string | null;
  status: string | null;
  due_at: Date | null;
  paid_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
};

type PaymentSqlRow = {
  id: string;
  invoice_id: string | null;
  booking_id: string | null;
  amount: string | number | null;
  currency: string | null;
  provider: string | null;
  status: string | null;
  provider_session_id: string | null;
  payment_intent_id: string | null;
  refund_id: string | null;
  paid_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
};

/** `query()` never applies rowToCamel, so every row is mapped here — including
 * the ones that come back from `insert … returning`. */
export function invoiceRowFromSql(row: InvoiceSqlRow): InvoiceRow {
  return {
    id: row.id,
    number: row.number ?? "",
    bookingId: row.booking_id ?? "",
    memberId: row.member_id,
    customerName: row.customer_name ?? "",
    customerEmail: row.customer_email ?? "",
    description: row.description ?? "",
    subtotal: Number(row.subtotal ?? 0),
    taxRate: Number(row.tax_rate ?? 0),
    taxAmount: Number(row.tax_amount ?? 0),
    amount: Number(row.amount ?? 0),
    currency: row.currency ?? "INR",
    status: row.status ?? "open",
    dueAt: row.due_at ?? new Date(),
    paidAt: row.paid_at,
    createdAt: row.created_at ?? new Date(),
    updatedAt: row.updated_at ?? new Date(),
  };
}

function paymentRowFromSql(row: PaymentSqlRow): PaymentRow {
  return {
    id: row.id,
    invoiceId: row.invoice_id ?? "",
    bookingId: row.booking_id ?? "",
    amount: Number(row.amount ?? 0),
    currency: row.currency ?? "INR",
    provider: row.provider ?? "manual",
    status: row.status ?? "pending",
    providerSessionId: row.provider_session_id,
    paymentIntentId: row.payment_intent_id,
    refundId: row.refund_id,
    paidAt: row.paid_at,
    createdAt: row.created_at ?? new Date(),
    updatedAt: row.updated_at ?? new Date(),
  };
}

export async function getInvoiceByIdInSupabase(id: string): Promise<InvoiceRow | null> {
  const rows = await query<InvoiceSqlRow>(
    `select ${INVOICE_COLUMNS} from public.invoices where id = $1`,
    [id],
  );
  return rows.rows[0] ? invoiceRowFromSql(rows.rows[0]) : null;
}

export type InvoiceInsert = {
  id: string;
  number: string;
  bookingId: string;
  memberId: string | null;
  customerName: string;
  customerEmail: string;
  description: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  amount: number;
  currency: string;
  status: string;
  dueAt: Date;
  paidAt: Date | null;
};

/**
 * Inserts the invoice unless one already exists for that booking, then returns
 * whichever row is there.
 *
 * `on conflict do nothing` has no target on purpose: `invoices.number` is unique
 * as well as the primary key, and a collision there must skip the row rather than
 * abort. The loser of a concurrent create then reads back the winner's row, which
 * is what the caller wants either way.
 */
export async function insertInvoiceIfAbsentInSupabase(values: InvoiceInsert): Promise<InvoiceRow | null> {
  const inserted = await query<InvoiceSqlRow>(
    `insert into public.invoices
       (id, number, booking_id, member_id, customer_name, customer_email, description, subtotal,
        tax_rate, tax_amount, amount, currency, status, due_at, paid_at, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now(), now())
     on conflict do nothing
     returning ${INVOICE_COLUMNS}`,
    [
      values.id, values.number, values.bookingId, values.memberId, values.customerName, values.customerEmail,
      values.description, values.subtotal, values.taxRate, values.taxAmount, values.amount, values.currency,
      values.status, values.dueAt, values.paidAt,
    ],
  );
  if (inserted.rows[0]) return invoiceRowFromSql(inserted.rows[0]);
  return getInvoiceByIdInSupabase(values.id);
}

/**
 * Creates an invoice for every booking that does not have one.
 *
 * One anti-join statement, where the Firestore version paged bookings in batches
 * of 25 and probed `invoices/{bookingId}` for each — an N+1 that ran on every
 * admin and member Billing page load, because both call it unconditionally.
 *
 * The GST split is repeated in SQL because it is applied per row inside the
 * statement. `billing-supabase.integration.test.ts` asserts it agrees with
 * `splitGstInclusive` across a range of amounts and rates rather than leaving the
 * duplication unchecked.
 */
export async function backfillInvoicesInSupabase(gstRate: number, currency: string): Promise<number> {
  // rate <= 0 means no split at all: subtotal is the full amount and tax is zero,
  // matching the guard in splitGstInclusive.
  const subtotalExpr = gstRate > 0
    ? `round(b.service_price / (1 + $1::numeric / 100))`
    : `b.service_price`;
  const taxExpr = gstRate > 0 ? `b.service_price - ${subtotalExpr}` : `0`;

  const result = await query(
    `insert into public.invoices
       (id, number, booking_id, member_id, customer_name, customer_email, description, subtotal,
        tax_rate, tax_amount, amount, currency, status, due_at, paid_at, created_at, updated_at)
     select b.id,
            'INV-' || extract(year from b.created_at)::int || '-'
              || lpad(upper(right(regexp_replace(b.id, '[^a-zA-Z0-9]', '', 'g'), 8)), 8, '0'),
            b.id,
            m.id,
            coalesce(b.client_name, 'Guest'),
            b.client_email,
            coalesce(b.service_title, 'Consultation'),
            ${subtotalExpr},
            $1,
            ${taxExpr},
            b.service_price,
            $2,
            case b.payment_status when 'paid' then 'paid' when 'refunded' then 'refunded' else 'open' end,
            b.scheduled_at,
            case when b.payment_status = 'paid' then b.updated_at else null end,
            now(),
            now()
       from public.bookings b
       left join lateral (
         select mem.id from public.members mem where mem.email = b.client_email limit 1
       ) m on true
       left join public.invoices existing on existing.id = b.id
      where existing.id is null
      on conflict do nothing`,
    [gstRate, currency],
  );
  return result.rowCount ?? 0;
}

export async function getInvoicesForAdminInSupabase(): Promise<InvoiceRow[]> {
  const rows = await query<InvoiceSqlRow>(
    `select ${INVOICE_COLUMNS} from public.invoices order by created_at desc`,
  );
  return rows.rows.map(invoiceRowFromSql);
}

export async function getInvoicesForCustomerInSupabase(email: string): Promise<InvoiceRow[]> {
  const rows = await query<InvoiceSqlRow>(
    `select ${INVOICE_COLUMNS} from public.invoices where customer_email = $1 order by created_at desc`,
    [email],
  );
  return rows.rows.map(invoiceRowFromSql);
}

export type InvoiceBookingRow = {
  id: string;
  reference: string | null;
  scheduledAt: Date | null;
  status: string | null;
  practitionerName: string | null;
};

/**
 * The booking columns the billing list shows, for every invoice at once.
 * `attachBilling` previously issued one `bookings.doc(id).get()` per invoice.
 */
export async function getBookingsForInvoicesInSupabase(bookingIds: string[]): Promise<Map<string, InvoiceBookingRow>> {
  if (!bookingIds.length) return new Map();
  const rows = await query<{
    id: string; reference: string | null; scheduled_at: Date | null; status: string | null;
    practitioner_name: string | null;
  }>(
    `select id, reference, scheduled_at, status, practitioner_name
       from public.bookings where id = any($1::text[])`,
    [bookingIds],
  );
  return new Map(rows.rows.map((row) => [row.id, {
    id: row.id,
    reference: row.reference,
    scheduledAt: row.scheduled_at,
    status: row.status,
    practitionerName: row.practitioner_name,
  }]));
}

/** Every payment for the given invoices, newest first, in one query. */
export async function getPaymentsForInvoicesInSupabase(invoiceIds: string[]): Promise<Map<string, PaymentRow[]>> {
  if (!invoiceIds.length) return new Map();
  const rows = await query<PaymentSqlRow>(
    `select id, invoice_id, booking_id, amount, currency, provider, status, provider_session_id,
            payment_intent_id, refund_id, paid_at, created_at, updated_at
       from public.payments
      where invoice_id = any($1::text[])
      order by created_at desc`,
    [invoiceIds],
  );
  const grouped = new Map<string, PaymentRow[]>();
  for (const row of rows.rows) {
    const payment = paymentRowFromSql(row);
    const list = grouped.get(payment.invoiceId);
    if (list) list.push(payment);
    else grouped.set(payment.invoiceId, [payment]);
  }
  return grouped;
}

// -------------------------------------------------------- invoice actions

/**
 * Why an invoice action could not be applied.
 *
 * The twin reports a code rather than throwing a customer-facing message, so the
 * wording lives in exactly one place (`invoice-actions.ts`) and both providers
 * produce identical text.
 */
export type InvoiceActionFailure =
  | "invoice_not_found"
  | "booking_not_found"
  | "already_paid"
  | "not_open"
  | "wrong_state"
  | "not_paid"
  | "no_refundable_payment";

export type InvoiceActionResult<T = InvoiceRow> =
  | { ok: true; value: T }
  | { ok: false; code: InvoiceActionFailure };

const PAYMENT_COLUMNS = `
  id, invoice_id, booking_id, amount, currency, provider, status, provider_session_id,
  payment_intent_id, refund_id, paid_at, created_at, updated_at`;

/**
 * Marks an invoice paid by hand and records the manual payment.
 *
 * The invoice row is locked for the duration, so two admins clicking "mark paid"
 * at the same time cannot both pass the status check and both write a payment.
 * The booking's payment_status moves with it — that is what the member's
 * dashboard and the practitioner's earnings read.
 */
export async function markInvoicePaidInSupabase(invoiceId: string): Promise<InvoiceActionResult<{ invoice: InvoiceRow; paymentId: string }>> {
  return withTransaction(async (client) => {
    const locked = await client.query<InvoiceSqlRow>(
      `select ${INVOICE_COLUMNS} from public.invoices where id = $1 for update`,
      [invoiceId],
    );
    if (!locked.rows[0]) return { ok: false as const, code: "invoice_not_found" as const };
    const invoice = invoiceRowFromSql(locked.rows[0]);
    if (invoice.status === "paid") return { ok: false as const, code: "already_paid" as const };
    if (invoice.status !== "open") return { ok: false as const, code: "not_open" as const };

    const booking = await client.query<{ id: string }>(
      `select id from public.bookings where id = $1 for update`,
      [invoice.bookingId],
    );
    if (!booking.rows[0]) return { ok: false as const, code: "booking_not_found" as const };

    const paymentId = randomUUID();
    await client.query(
      `insert into public.payments
         (id, invoice_id, booking_id, amount, currency, provider, status, paid_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,'manual','succeeded', now(), now(), now())`,
      [paymentId, invoice.id, invoice.bookingId, invoice.amount, invoice.currency],
    );
    await client.query(
      `update public.invoices set status = 'paid', paid_at = now(), updated_at = now() where id = $1`,
      [invoiceId],
    );
    await client.query(
      `update public.bookings set payment_status = 'paid', updated_at = now() where id = $1`,
      [invoice.bookingId],
    );
    return { ok: true as const, value: { invoice: { ...invoice, status: "paid" }, paymentId } };
  });
}

/**
 * Voids or reopens an invoice.
 *
 * One conditional update: the `and status = $3` predicate is the state check, so
 * there is no read-then-write window for a concurrent void and reopen to
 * interleave. rowCount 0 is then resolved into "not found" or "wrong state".
 */
export async function changeInvoiceStateInSupabase(invoiceId: string, expected: string, next: string): Promise<InvoiceActionResult> {
  const updated = await query<InvoiceSqlRow>(
    `update public.invoices set status = $2, updated_at = now()
      where id = $1 and status = $3
      returning ${INVOICE_COLUMNS}`,
    [invoiceId, next, expected],
  );
  if (updated.rows[0]) return { ok: true, value: invoiceRowFromSql(updated.rows[0]) };

  const existing = await getInvoiceByIdInSupabase(invoiceId);
  if (!existing) return { ok: false, code: "invoice_not_found" };
  return { ok: false, code: "wrong_state" };
}

export type RefundClaim = { invoice: InvoiceRow; payment: PaymentRow };

/** Thrown to force a rollback, then translated back into a result code.
 * `withTransaction` commits on any normal return — including a `{ ok: false }`
 * one — so a failure that happens *after* a write has to throw, or the write
 * sticks. Returning a failure here left the invoice stranded in
 * `refund_processing`, where no action could ever move it again. */
class RollbackSignal extends Error {
  constructor(readonly code: InvoiceActionFailure) {
    super(code);
  }
}

/**
 * Claims an invoice for refund: invoice to `refund_processing`, its newest
 * succeeded payment to `refund_processing`, atomically.
 *
 * The invoice predicate `and status = 'paid'` is the claim, exactly as in
 * `claimRefundInSupabase` for gemstone orders — whichever statement actually
 * changes the row owns the refund, so only one caller ever reaches Razorpay.
 * Both writes share a transaction, and a paid invoice with no refundable payment
 * throws so the invoice status change is rolled back rather than stranded.
 */
export async function claimInvoiceRefundInSupabase(invoiceId: string): Promise<InvoiceActionResult<RefundClaim>> {
  try {
    return await withTransaction(async (client) => {
      const claimed = await client.query<InvoiceSqlRow>(
        `update public.invoices set status = 'refund_processing', updated_at = now()
          where id = $1 and status = 'paid'
          returning ${INVOICE_COLUMNS}`,
        [invoiceId],
      );
      // Nothing changed: either the invoice is gone or it was not paid. Both are
      // decided without a write, so a plain return is safe here.
      //
      // Deliberately `client.query` and not getInvoiceByIdInSupabase: that helper goes through
      // the pool and would check out a SECOND connection while this transaction still holds one.
      // With max: 10, ten concurrent claims on non-refundable invoices each hold a client and
      // wait for an eleventh that cannot exist — every one of them blocks until
      // connectionTimeoutMillis and then fails with a timeout instead of the invoice_not_found
      // or not_paid the caller is meant to get. It also reads outside this transaction, so it
      // cannot see the transaction's own state.
      if (!claimed.rows[0]) {
        const existing = await client.query<InvoiceSqlRow>(
          `select ${INVOICE_COLUMNS} from public.invoices where id = $1`,
          [invoiceId],
        );
        if (!existing.rows[0]) throw new RollbackSignal("invoice_not_found");
        throw new RollbackSignal("not_paid");
      }
      const invoice = invoiceRowFromSql(claimed.rows[0]);

      const payment = await client.query<PaymentSqlRow>(
        `update public.payments set status = 'refund_processing', updated_at = now()
          where id = (
            select id from public.payments
             where invoice_id = $1 and status = 'succeeded'
             order by created_at desc limit 1
          )
          returning ${PAYMENT_COLUMNS}`,
        [invoiceId],
      );
      // The invoice was already flipped above, so this MUST throw to undo it.
      if (!payment.rows[0]) throw new RollbackSignal("no_refundable_payment");

      return { ok: true as const, value: { invoice, payment: paymentRowFromSql(payment.rows[0]) } };
    });
  } catch (error) {
    if (error instanceof RollbackSignal) return { ok: false, code: error.code };
    throw error;
  }
}

/** Puts the invoice and payment back the way the claim found them, after a
 * provider-side refund failure. */
export async function rollbackInvoiceRefundInSupabase(invoiceId: string, paymentId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`update public.invoices set status = 'paid', updated_at = now() where id = $1`, [invoiceId]);
    await client.query(`update public.payments set status = 'succeeded', updated_at = now() where id = $1`, [paymentId]);
  });
}

/**
 * Writes the refund outcome. A provider that reports anything other than
 * `processed` leaves both rows in `refund_pending` and does NOT touch the
 * booking, because the money has not actually moved yet.
 */
export async function completeInvoiceRefundInSupabase(
  invoiceId: string,
  paymentId: string,
  bookingId: string,
  refundId: string,
  completed: boolean,
): Promise<void> {
  const status = completed ? "refunded" : "refund_pending";
  await withTransaction(async (client) => {
    await client.query(
      `update public.payments set status = $2, refund_id = $3, updated_at = now() where id = $1`,
      [paymentId, status, refundId],
    );
    await client.query(`update public.invoices set status = $2, updated_at = now() where id = $1`, [invoiceId, status]);
    if (completed) {
      await client.query(
        `update public.bookings set payment_status = 'refunded', updated_at = now() where id = $1`,
        [bookingId],
      );
    }
  });
}

/**
 * The newest still-pending payment attempt for an invoice, or null.
 *
 * Checkout reuses one inside the window instead of minting a new Razorpay order:
 * without it, a customer whose payment succeeded but whose webhook has not landed
 * yet can retry checkout and be charged twice for the same invoice.
 */
export async function getPendingPaymentForInvoiceInSupabase(invoiceId: string): Promise<PaymentRow | null> {
  const rows = await query<PaymentSqlRow>(
    `select ${PAYMENT_COLUMNS} from public.payments
      where invoice_id = $1 and status = 'pending'
      order by created_at desc limit 1`,
    [invoiceId],
  );
  return rows.rows[0] ? paymentRowFromSql(rows.rows[0]) : null;
}

export async function insertPendingPaymentInSupabase(values: {
  invoiceId: string;
  bookingId: string;
  amount: number;
  currency: string;
  providerSessionId: string;
}): Promise<PaymentRow> {
  const rows = await query<PaymentSqlRow>(
    `insert into public.payments
       (id, invoice_id, booking_id, amount, currency, provider, status, provider_session_id,
        payment_intent_id, refund_id, paid_at, created_at, updated_at)
     values ($1,$2,$3,$4,$5,'razorpay','pending',$6, null, null, null, now(), now())
     returning ${PAYMENT_COLUMNS}`,
    [randomUUID(), values.invoiceId, values.bookingId, values.amount, values.currency, values.providerSessionId],
  );
  const row = rows.rows[0];
  if (!row) throw new Error("insertPendingPaymentInSupabase returned no row");
  return paymentRowFromSql(row);
}

/** Looks up the payment attempt a Razorpay callback refers to. */
export async function getPaymentBySessionIdInSupabase(invoiceId: string, providerSessionId: string): Promise<PaymentRow | null> {
  const rows = await query<PaymentSqlRow>(
    `select ${PAYMENT_COLUMNS} from public.payments where invoice_id = $1 and provider_session_id = $2 limit 1`,
    [invoiceId, providerSessionId],
  );
  return rows.rows[0] ? paymentRowFromSql(rows.rows[0]) : null;
}

/**
 * Confirms a verified payment: payment succeeded, invoice paid, booking paid.
 *
 * All three in one transaction. Splitting them would let a crash between the
 * writes leave a paid invoice on an unpaid booking, or a succeeded payment on an
 * open invoice — both of which read as "the customer still owes us".
 */
export async function confirmInvoicePaymentInSupabase(values: {
  paymentId: string;
  invoiceId: string;
  bookingId: string;
  paymentIntentId: string;
}): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `update public.payments
          set status = 'succeeded', payment_intent_id = $2, paid_at = now(), updated_at = now()
        where id = $1`,
      [values.paymentId, values.paymentIntentId],
    );
    await client.query(
      `update public.invoices set status = 'paid', paid_at = now(), updated_at = now() where id = $1`,
      [values.invoiceId],
    );
    await client.query(
      `update public.bookings set payment_status = 'paid', updated_at = now() where id = $1`,
      [values.bookingId],
    );
  });
}

export type InvoiceBookingDetail = {
  reference: string;
  scheduledAt: Date;
  status: string;
  practitionerName: string | null;
};

/** The invoice plus its booking summary and payments, for the admin response. */
export async function getInvoiceDetailInSupabase(invoiceId: string): Promise<{
  invoice: InvoiceRow;
  booking: InvoiceBookingDetail;
  payments: PaymentRow[];
} | null> {
  const invoice = await getInvoiceByIdInSupabase(invoiceId);
  if (!invoice) return null;
  const bookings = await query<{
    reference: string | null; scheduled_at: Date | null; status: string | null; practitioner_name: string | null;
  }>(`select reference, scheduled_at, status, practitioner_name from public.bookings where id = $1`, [invoice.bookingId]);
  const bookingRow = bookings.rows[0];
  if (!bookingRow) return null;
  const payments = await query<PaymentSqlRow>(
    `select ${PAYMENT_COLUMNS} from public.payments where invoice_id = $1 order by created_at desc`,
    [invoiceId],
  );
  return {
    invoice,
    booking: {
      reference: bookingRow.reference ?? "",
      scheduledAt: bookingRow.scheduled_at ?? invoice.dueAt,
      status: bookingRow.status ?? "",
      practitionerName: bookingRow.practitioner_name,
    },
    payments: payments.rows.map(paymentRowFromSql),
  };
}
