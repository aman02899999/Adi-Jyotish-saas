-- Restores the idempotency guarantee the pre-Firestore schema had on subscription invoices.
--
-- src/lib/subscriptions.ts still carries the note that this used to be
-- `onConflictDoNothing({ target: subscriptionInvoices.razorpayPaymentId })`. The Firestore
-- rewrite reproduced it with the payment id as the document id, and the migration to Postgres
-- carried over the column but not the constraint — so nothing stopped a retried verify call
-- (double submit, a client retrying on timeout) writing a second paid invoice for one payment.
--
-- Partial, because a row may legitimately have no razorpay_payment_id: invoices raised by the
-- renewal webhook before the payment lands, and any historical row imported without one. A plain
-- unique index would collapse all of those into a single permitted null.
create unique index if not exists subscription_invoices_razorpay_payment_key
  on public.subscription_invoices (razorpay_payment_id)
  where razorpay_payment_id is not null;
