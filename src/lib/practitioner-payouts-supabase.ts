import "server-only";

import { randomUUID } from "node:crypto";

import { query, queryModels, withTransaction } from "@/lib/postgres";

/**
 * Postgres data access for practitioner payouts.
 *
 * The payout *rules* — the auto-approve threshold, the destination cooldown, the
 * balance arithmetic — stay in practitioner-portal.ts. What lives here is the
 * atomicity, which is the part that cannot be reproduced with plain queries.
 *
 * requestPayout is a read-check-write over the payouts table: it totals what has
 * already been paid and requested, then refuses the request if the amount exceeds
 * what is left. Firestore gave that atomicity via runTransaction. Postgres does
 * not retry on conflict, so createPayoutRequestInSupabase takes an explicit
 * `for update` lock on the practitioner row first — that is what serialises two
 * concurrent requests (double click, two tabs) from the same practitioner.
 * Without it both read the same stale total and both pass the balance check.
 */

/** Mirrors PractitionerPayout in practitioner-portal.ts. */
export type PayoutRow = {
  id: string;
  practitionerId: string;
  amount: number;
  currency: string;
  status: string;
  payoutMethod: string;
  transactionRef: string | null;
  notes: string | null;
  adminNotes: string | null;
  processedBy: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  updatedAt: Date;
};

/** amount is numeric(14,2), which node-postgres returns as a string. Naming it is
 * what keeps payout arithmetic arithmetic. */
const PAYOUT_NUMERIC_COLUMNS = ["amount"] as const;

const PAYOUT_SELECT = `
  select id, practitioner_id, amount, currency, status, payout_method,
         transaction_ref, notes, admin_notes, processed_by,
         requested_at, processed_at, updated_at
    from public.practitioner_payouts`;

/** client.query does not apply the snake→camel mapping that queryModels does —
 * including on a `returning` clause — so rows read inside a transaction are mapped
 * by hand here rather than trusted. */
type PayoutSqlRow = {
  id: string;
  practitioner_id: string;
  amount: string;
  currency: string;
  status: string;
  payout_method: string;
  transaction_ref: string | null;
  notes: string | null;
  admin_notes: string | null;
  processed_by: string | null;
  requested_at: Date;
  processed_at: Date | null;
  updated_at: Date;
};

function payoutFromSqlRow(row: PayoutSqlRow): PayoutRow {
  return {
    id: row.id,
    practitionerId: row.practitioner_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    payoutMethod: row.payout_method,
    transactionRef: row.transaction_ref,
    notes: row.notes,
    adminNotes: row.admin_notes,
    processedBy: row.processed_by,
    requestedAt: row.requested_at,
    processedAt: row.processed_at,
    updatedAt: row.updated_at,
  };
}

export async function getPractitionerPayoutsInSupabase(practitionerId: string): Promise<PayoutRow[]> {
  return queryModels<PayoutRow>(
    `${PAYOUT_SELECT} where practitioner_id = $1 order by requested_at desc`,
    [practitionerId],
    PAYOUT_NUMERIC_COLUMNS,
  );
}

export async function getPractitionerPayoutInSupabase(id: string): Promise<PayoutRow | null> {
  const rows = await queryModels<PayoutRow>(`${PAYOUT_SELECT} where id = $1`, [id], PAYOUT_NUMERIC_COLUMNS);
  return rows[0] ?? null;
}

export async function getAllPayoutsInSupabase(status?: string): Promise<PayoutRow[]> {
  return queryModels<PayoutRow>(
    status ? `${PAYOUT_SELECT} where status = $1 order by requested_at desc` : `${PAYOUT_SELECT} order by requested_at desc`,
    status ? [status] : [],
    PAYOUT_NUMERIC_COLUMNS,
  );
}

/** What requestPayout needs to know about the practitioner before it will pay them. */
export async function getPayoutEligibilityInSupabase(
  practitionerId: string,
): Promise<{ isDemoAccount: boolean; payoutDetailsUpdatedAt: Date | null } | null> {
  const rows = await query<{ is_demo_account: boolean; payout_details_updated_at: Date | null }>(
    `select is_demo_account, payout_details_updated_at from public.practitioners where id = $1`,
    [practitionerId],
  );
  const row = rows.rows[0];
  return row ? { isDemoAccount: row.is_demo_account, payoutDetailsUpdatedAt: row.payout_details_updated_at } : null;
}

/**
 * Everything the practitioner has earned and can still draw down.
 *
 * Both halves are summed in SQL rather than pulled into the app: bookings counts
 * paid, non-cancelled service prices; chat counts the captured amount of ended
 * sessions. Both columns are numeric, so the sums come back as strings and are
 * converted once here.
 */
export async function getPayoutLedgerInSupabase(
  practitionerId: string,
): Promise<{ totalEarned: number; paidOut: number; pendingOut: number; hasPriorPaid: boolean; hasRejection: boolean }> {
  const [earnings, payouts] = await Promise.all([
    query<{ earned: string }>(
      `select coalesce(
                 (select sum(service_price) from public.bookings
                   where practitioner_id = $1 and payment_status = 'paid' and status <> 'cancelled'), 0)
             + coalesce(
                 (select sum(captured_amount) from public.chat_sessions
                   where practitioner_id = $1 and status = 'ended'), 0) as earned`,
      [practitionerId],
    ),
    query<{ paid_out: string; pending_out: string; has_prior_paid: boolean; has_rejection: boolean }>(
      `select coalesce(sum(amount) filter (where status = 'paid'), 0) as paid_out,
              coalesce(sum(amount) filter (where status in ('requested','approved')), 0) as pending_out,
              coalesce(bool_or(status = 'paid'), false) as has_prior_paid,
              coalesce(bool_or(status = 'rejected'), false) as has_rejection
         from public.practitioner_payouts
        where practitioner_id = $1`,
      [practitionerId],
    ),
  ]);
  return {
    totalEarned: Number(earnings.rows[0]?.earned ?? 0),
    paidOut: Number(payouts.rows[0]?.paid_out ?? 0),
    pendingOut: Number(payouts.rows[0]?.pending_out ?? 0),
    hasPriorPaid: Boolean(payouts.rows[0]?.has_prior_paid),
    hasRejection: Boolean(payouts.rows[0]?.has_rejection),
  };
}

/** What the caller decides, given the ledger read under the lock. */
export type PayoutDecision = {
  status: string;
  adminNotes: string | null;
  processedBy: string | null;
  autoApproved: boolean;
};

export type PayoutLedgerSnapshot = {
  paidOut: number;
  pendingOut: number;
  hasPriorPaid: boolean;
  hasRejection: boolean;
};

/**
 * Creates a payout request atomically.
 *
 * `decide` runs *inside* the transaction, after the practitioner row is locked and
 * the ledger re-read, so the caller's balance rule is applied to fresh numbers
 * rather than to whatever was visible when the request started. Throwing from
 * `decide` rolls the insert back, which is how PayoutError propagates.
 */
export async function createPayoutRequestInSupabase({
  practitionerId,
  amount,
  notes,
  decide,
}: {
  practitionerId: string;
  amount: number;
  notes: string | null;
  decide: (ledger: PayoutLedgerSnapshot) => PayoutDecision | Promise<PayoutDecision>;
}): Promise<PayoutRow> {
  return withTransaction(async (client) => {
    // Serialises concurrent requests from the same practitioner.
    await client.query(`select id from public.practitioners where id = $1 for update`, [practitionerId]);

    const ledgerResult = await client.query<{
      paid_out: string;
      pending_out: string;
      has_prior_paid: boolean;
      has_rejection: boolean;
    }>(
      `select coalesce(sum(amount) filter (where status = 'paid'), 0) as paid_out,
              coalesce(sum(amount) filter (where status in ('requested','approved')), 0) as pending_out,
              coalesce(bool_or(status = 'paid'), false) as has_prior_paid,
              coalesce(bool_or(status = 'rejected'), false) as has_rejection
         from public.practitioner_payouts
        where practitioner_id = $1`,
      [practitionerId],
    );
    const ledgerRow = ledgerResult.rows[0];
    const decision = await decide({
      paidOut: Number(ledgerRow?.paid_out ?? 0),
      pendingOut: Number(ledgerRow?.pending_out ?? 0),
      hasPriorPaid: Boolean(ledgerRow?.has_prior_paid),
      hasRejection: Boolean(ledgerRow?.has_rejection),
    });

    const inserted = await client.query<PayoutSqlRow>(
      `insert into public.practitioner_payouts
         (id, practitioner_id, amount, currency, status, payout_method, transaction_ref,
          notes, admin_notes, processed_by, processed_at)
       values ($1, $2, $3, 'INR', $4, 'bank_transfer', null, $5, $6, $7,
               case when $8 then now() else null end)
       returning id, practitioner_id, amount, currency, status, payout_method,
                 transaction_ref, notes, admin_notes, processed_by,
                 requested_at, processed_at, updated_at`,
      [randomUUID(), practitionerId, amount, decision.status, notes, decision.adminNotes, decision.processedBy, decision.autoApproved],
    );
    return payoutFromSqlRow(inserted.rows[0] as PayoutSqlRow);
  });
}

/**
 * Applies a status transition atomically.
 *
 * The caller supplies `assertTransition`, which throws when the move is not
 * allowed. It runs inside the transaction, after the row is locked, so two admins
 * acting on the same payout cannot both read "approved" and both move it to
 * "paid" — the second blocks on the lock and then sees the new status.
 *
 * adminNotes and transactionRef are written through as given, including null.
 * That deliberately matches the Firestore behaviour: an admin clearing the notes
 * field means clearing it, not leaving the previous value in place.
 */
export async function transitionPayoutStatusInSupabase({
  id,
  status,
  adminNotes,
  processedBy,
  transactionRef,
  assertTransition,
}: {
  id: string;
  status: string;
  adminNotes: string | null;
  processedBy: string;
  transactionRef: string | null;
  assertTransition: (currentStatus: string) => void;
}): Promise<PayoutRow> {
  return withTransaction(async (client) => {
    const locked = await client.query<{ status: string }>(
      `select status from public.practitioner_payouts where id = $1 for update`,
      [id],
    );
    const current = locked.rows[0];
    if (!current) throw new PayoutNotFoundError();
    assertTransition(current.status);

    const updated = await client.query<PayoutSqlRow>(
      `update public.practitioner_payouts
          set status = $2,
              admin_notes = $3,
              transaction_ref = $4,
              processed_by = $5,
              processed_at = now(),
              updated_at = now()
        where id = $1
        returning id, practitioner_id, amount, currency, status, payout_method,
                  transaction_ref, notes, admin_notes, processed_by,
                  requested_at, processed_at, updated_at`,
      [id, status, adminNotes, transactionRef, processedBy],
    );
    return payoutFromSqlRow(updated.rows[0] as PayoutSqlRow);
  });
}

/** Sentinel the caller translates into its own error type, so this module does not
 * have to import PayoutError from practitioner-portal.ts (which would be circular). */
export class PayoutNotFoundError extends Error {
  constructor() {
    super("PAYOUT_NOT_FOUND");
    this.name = "PayoutNotFoundError";
  }
}
