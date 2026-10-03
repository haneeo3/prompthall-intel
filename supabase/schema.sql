-- PromptHall Monitor: tables used by uptime-monitor.js and incident-manager.js.
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: everything uses IF NOT EXISTS.

-- One row per site per monitor run.
create table if not exists public.uptime_checks (
  id                   bigint generated always as identity primary key,
  site_id              uuid not null references public.sites (id) on delete cascade,
  checked_at           timestamptz not null default now(),
  pages_checked        integer not null default 0,
  pages_broken         integer not null default 0,
  pages_slow           integer not null default 0,
  homepage_ok          boolean not null default false,
  homepage_response_ms integer,
  results_json         jsonb,
  created_at           timestamptz not null default now()
);

create index if not exists uptime_checks_site_checked_idx
  on public.uptime_checks (site_id, checked_at desc);

-- One row per outage. resolved_at is null while the incident is open.
create table if not exists public.incidents (
  id             bigint generated always as identity primary key,
  site_id        uuid not null references public.sites (id) on delete cascade,
  page_url       text not null,
  type           text not null,            -- downtime | server_error | page_error | performance | unknown
  severity       text not null,            -- critical | warning
  description    text,
  recommendation text,
  detected_at    timestamptz not null default now(),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- Fast lookup of "is there an open incident for this page?"
create index if not exists incidents_open_idx
  on public.incidents (site_id, page_url)
  where resolved_at is null;

-- Lock both tables down: only the service_role key (used by the monitor)
-- can read or write them. The public anon key gets nothing.
alter table public.uptime_checks enable row level security;
alter table public.incidents     enable row level security;

-- Technical details for developers (added with the "For your developer"
-- email section). Safe on both fresh and existing incidents tables.
alter table public.incidents add column if not exists status_code       integer;
alter table public.incidents add column if not exists error_type        text;   -- dns | tls | timeout | connection_refused | connection_reset | network | http_4xx | http_5xx
alter table public.incidents add column if not exists response_time_ms  integer;
alter table public.incidents add column if not exists technical_details jsonb;
