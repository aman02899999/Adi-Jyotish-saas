/**
 * Invoice action error types, in a module of their own — the same shape as
 * wallet-errors.ts.
 *
 * `billing-supabase.ts` (Postgres) and `invoice-actions.ts` (which branches
 * between providers) both throw these, and the three invoice routes catch them
 * to pick an HTTP status. Keeping them here avoids a circular import between the
 * twin and its caller.
 */

/** The invoice, its booking, or the payment attempt does not exist. Routes map
 * this to 404. */
export class InvoiceNotFoundError extends Error {}

/** The action is not valid for the invoice's current state — already paid, not
 * open, already refunded, no refundable payment. Routes map this to 409. */
export class InvoiceConflictError extends Error {}
