-- The horoscope cache is keyed by its id, not by (sign, date).
--
-- src/lib/horoscopes.ts caches readings under ids like `aries_2026-09-21` (that day),
-- `aries_week_2026-09-21` (the week starting that Monday) and `aries_month_2026-09`. The daily and
-- weekly rows for a Monday share sign and date, so 0003's unique index on (sign, date) rejected
-- whichever arrived second: in the copy, any week whose Monday also had a cached daily reading
-- failed to insert, and after cutover the Monday week-ahead reading could never be stored.
-- The primary key already makes each cached reading unique.
drop index if exists public.daily_horoscopes_sign_date_key;
create index if not exists daily_horoscopes_sign_date_idx on public.daily_horoscopes (sign, date);
