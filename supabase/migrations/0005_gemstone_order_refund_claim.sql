-- 0005 — gemstone order refund claim marker, and coupon usage columns that
-- Firestore documents do not actually carry
--
-- 1. refund_claimed_at
--
-- gemstone-orders.ts claims a refund by writing `refundClaimedAt` to the order
-- document *before* calling Razorpay, so that only the request which wins the
-- claim ever issues a real refund. The column was missing from 0003 because it
-- is not part of the `GemstoneOrder` TypeScript type — it is read back through
-- an ad-hoc cast (`snap.data() as { refundClaimedAt?: unknown }`), so deriving
-- the schema from the types could not see it.
--
-- Without it the refund path cannot be ported safely: the "is this already
-- refunded?" read would have no durable marker to claim, and a double-click or
-- a retried request could fire two real refunds for one order.
--
-- 2. gemstone_coupon_customer_usage.coupon_code / customer_identifier
--
-- The app writes these documents with exactly two fields:
--
--     tx.set(doc(`${couponCode}_${identifier}`), { count, updatedAt }, { merge: true })
--
-- (gemstone-orders.ts:39, :541). The coupon code and the customer identifier
-- live only in the *document id*. Nothing in src/ reads either column — they
-- exist purely so the rows are legible in a database client. Declaring them
-- `not null` therefore made the whole collection uncopiable: every row would
-- arrive with both null and abort the batch mid-cutover.
--
-- They are nullable now, and the runbook carries a backfill that recovers both
-- from the id after the copy runs.

alter table public.gemstone_orders
  add column if not exists refund_claimed_at timestamptz;

comment on column public.gemstone_orders.refund_claimed_at is
  'Set transactionally before calling Razorpay, so exactly one concurrent refund request per order ever reaches the gateway. Null until a refund is attempted.';

alter table public.gemstone_coupon_customer_usage
  alter column coupon_code drop not null;

alter table public.gemstone_coupon_customer_usage
  alter column customer_identifier drop not null;

comment on column public.gemstone_coupon_customer_usage.coupon_code is
  'Denormalised out of the document id (``<couponCode>_<identifier>``). Firestore never stored it as a field, so copied rows arrive null until the post-copy backfill runs. Not read by the application.';

comment on column public.gemstone_coupon_customer_usage.customer_identifier is
  'Member id or lowercased guest email. Same story as coupon_code.';

-- Backfill, idempotent. Run AFTER scripts/migrate-firestore-to-supabase.mjs, not
-- as part of the migration: gemstone_coupons has to be populated first for the
-- prefix match to work. Splitting on the first underscore would be wrong for a
-- code that itself contains one, so match against the known codes and take the
-- longest prefix.
--
--   update public.gemstone_coupon_customer_usage u
--      set coupon_code = c.code,
--          customer_identifier = right(u.id, length(u.id) - length(c.code) - 1)
--     from public.gemstone_coupons c
--    where u.coupon_code is null
--      and u.id like c.code || '\_%'
--      and not exists (
--        select 1 from public.gemstone_coupons c2
--         where u.id like c2.code || '\_%' and length(c2.code) > length(c.code)
--      );
