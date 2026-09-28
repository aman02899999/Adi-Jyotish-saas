-- Bookings: record which appointment time a reminder was sent for.
--
-- The FAQ promises "You'll get a reminder as the time approaches". src/lib/booking-reminders.ts
-- sends it, and claims each booking by setting this column to the booking's own scheduled_at in
-- the same UPDATE that selects it. Storing the time rather than a flag means a booking moved to a
-- new slot is due again without the reschedule path having to clear anything.
alter table public.bookings add column if not exists reminder_sent_for timestamptz;
