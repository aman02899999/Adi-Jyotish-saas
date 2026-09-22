-- Aligns the members foreign keys with the account-deletion policy that
-- src/lib/account-deletion.ts already implements against Firestore.
--
-- Five of them were inverted relative to that policy, in both directions. Proven against a
-- migrated database by inserting a member with a ₹2500 ended chat session, a ₹4990 subscription
-- invoice and a kundli match, then running `delete from members`:
--
--   chat_sessions          ₹2500 practitioner earnings   DESTROYED  (should be retained)
--   subscription_invoices  ₹4990 financial record        DESTROYED  (should be retained)
--   kundli_matches         name + birth date + place     SURVIVED   (should be erased)
--
-- Both failures are silent: the delete succeeds and reports nothing.
--
-- Retained-but-detached (cascade -> set null). The Firestore path keeps these rows deliberately
-- and only clears the member link:
--   - chat_sessions.captured_amount is summed for practitioner payouts, so destroying the row
--     destroys someone else's earnings record. account-deletion.ts carries a comment saying
--     exactly this; the schema disagreed with it.
--   - subscription_invoices are financial records the business must legally retain. The Firestore
--     path anonymizes them (memberId := null) rather than deleting them.
-- Both columns were NOT NULL, so they could not even be detached before the cascade fired.
--
-- Member-owned (set null -> cascade). These carry birth dates, birth places and names — the
-- member's own PII, which the Firestore path deletes outright. Under set null the rows survived
-- an erasure request with the PII intact and only the foreign key nulled. Application code
-- deletes them explicitly, but the constraint is what makes a direct `delete from members`
-- (a support script, a console) honour the erasure too.

alter table public.chat_sessions alter column member_id drop not null;
alter table public.chat_sessions drop constraint chat_sessions_member_id_fkey;
alter table public.chat_sessions add constraint chat_sessions_member_id_fkey
  foreign key (member_id) references public.members (id) on delete set null;

-- subscription_invoices needs BOTH of its links broken, not just the member one. Detaching
-- member_id alone still lost the row, because there is a second cascade path:
--   members -> member_subscriptions (cascade) -> subscription_invoices (cascade)
-- member_subscriptions is correctly member-owned and should go, but the invoices it paid for are
-- the financial record that has to outlive it.
alter table public.subscription_invoices alter column member_id drop not null;
alter table public.subscription_invoices drop constraint subscription_invoices_member_id_fkey;
alter table public.subscription_invoices add constraint subscription_invoices_member_id_fkey
  foreign key (member_id) references public.members (id) on delete set null;

alter table public.subscription_invoices alter column subscription_id drop not null;
alter table public.subscription_invoices drop constraint subscription_invoices_subscription_id_fkey;
alter table public.subscription_invoices add constraint subscription_invoices_subscription_id_fkey
  foreign key (subscription_id) references public.member_subscriptions (id) on delete set null;

alter table public.kundli_matches drop constraint kundli_matches_member_id_fkey;
alter table public.kundli_matches add constraint kundli_matches_member_id_fkey
  foreign key (member_id) references public.members (id) on delete cascade;

alter table public.numerology_readings drop constraint numerology_readings_member_id_fkey;
alter table public.numerology_readings add constraint numerology_readings_member_id_fkey
  foreign key (member_id) references public.members (id) on delete cascade;

alter table public.gemstone_recommendations drop constraint gemstone_recommendations_member_id_fkey;
alter table public.gemstone_recommendations add constraint gemstone_recommendations_member_id_fkey
  foreign key (member_id) references public.members (id) on delete cascade;
