-- Per-account limit on wrong two-factor codes.
--
-- The existing throttle (src/lib/auth-throttle.ts) keys on account *and* client IP and lives in
-- one server instance's memory, so someone who already has an account's password could keep
-- guessing 6-digit codes by rotating IPs. This table counts wrong codes per account across every
-- instance; src/lib/two-factor.ts locks the account's 2FA step once it reaches the limit.
-- Rows are small, keyed by "<role>:<account id>", and cleared on the next correct code.
create table if not exists public.two_factor_failures (
  id text primary key,
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);

alter table public.two_factor_failures enable row level security;
