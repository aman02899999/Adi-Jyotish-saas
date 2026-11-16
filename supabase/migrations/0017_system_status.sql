-- The site's own record of its background jobs (src/lib/automation/system-status.ts).
--
-- The host keeps logs for about an hour, so without this nobody can tell the next morning whether
-- a scheduled job ran. One row per run; the health check (/api/status) reads the newest row per
-- job. Summaries hold counts and page addresses only, never a member's details.
create table if not exists public.system_status (
  id bigint generated always as identity primary key,
  key text not null,
  at timestamptz not null default now(),
  ok boolean not null,
  mode text not null check (mode in ('dry-run', 'on')),
  source text not null check (source in ('cron', 'retry', 'admin')),
  attempts integer not null default 1,
  summary text not null default ''
);

create index if not exists system_status_key_at_idx on public.system_status (key, at desc);

-- "Once a day" claims: an alert for one problem is emailed once per India day however often the
-- check runs. The id carries the problem and the date.
create table if not exists public.system_status_claims (
  id text primary key,
  at timestamptz not null default now()
);

-- Server-only tables: row level security with no policy closes them to the browser keys.
alter table public.system_status enable row level security;
alter table public.system_status_claims enable row level security;
