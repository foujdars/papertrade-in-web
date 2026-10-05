-- Server-authoritative USD practice wallet. Apply once in Supabase SQL Editor.
begin;
create table if not exists public.paper_bot_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account jsonb not null check (jsonb_typeof(account) = 'object'),
  version bigint not null default 1,
  active boolean not null default false,
  last_checked_at bigint not null default 0,
  last_error text not null default '',
  lease_until bigint not null default 0,
  lease_token uuid,
  updated_at timestamptz not null default now()
);
create index if not exists paper_bot_active on public.paper_bot_accounts (active) where active;
create table if not exists public.paper_bot_runtime (
  id boolean primary key default true check (id),
  last_run bigint not null default 0,
  previous_run bigint not null default 0,
  ok boolean not null default false,
  failed integer not null default 0
);
alter table public.paper_bot_accounts enable row level security;
alter table public.paper_bot_runtime enable row level security;
-- Only the server can access these tables. Requests authenticate their Supabase user first.
revoke all on public.paper_bot_accounts, public.paper_bot_runtime from anon, authenticated;
grant all on public.paper_bot_accounts, public.paper_bot_runtime to service_role;

create or replace function public.paper_bot_compare_and_set(
  p_user_id uuid, p_version bigint, p_account jsonb, p_active boolean,
  p_checked bigint default null, p_error text default null
) returns setof public.paper_bot_accounts
language sql security definer set search_path = '' as $$
  update public.paper_bot_accounts
  set account = p_account, version = version + 1, active = p_active,
      last_checked_at = coalesce(p_checked, last_checked_at),
      last_error = coalesce(p_error, last_error), updated_at = now()
  where user_id = p_user_id and version = p_version
  returning *;
$$;
revoke all on function public.paper_bot_compare_and_set(uuid,bigint,jsonb,boolean,bigint,text) from public, anon, authenticated;
grant execute on function public.paper_bot_compare_and_set(uuid,bigint,jsonb,boolean,bigint,text) to service_role;

-- Leases avoid duplicate expensive evaluations; version checks still protect every write.
-- Manual pause/exit is never blocked by a worker lease. A crashed worker expires in 60s.
create or replace function public.paper_bot_claim(p_user_id uuid, p_now bigint, p_token uuid)
returns setof public.paper_bot_accounts
language sql security definer set search_path = '' as $$
  update public.paper_bot_accounts set lease_until = p_now + 60000, lease_token = p_token
  where user_id = p_user_id and active and lease_until <= p_now returning *;
$$;
create or replace function public.paper_bot_release(p_user_id uuid, p_token uuid)
returns void language sql security definer set search_path = '' as $$
  update public.paper_bot_accounts set lease_until = 0, lease_token = null
  where user_id = p_user_id and lease_token = p_token;
$$;
revoke all on function public.paper_bot_claim(uuid,bigint,uuid), public.paper_bot_release(uuid,uuid) from public, anon, authenticated;
grant execute on function public.paper_bot_claim(uuid,bigint,uuid), public.paper_bot_release(uuid,uuid) to service_role;

create or replace function public.paper_bot_heartbeat(p_at bigint, p_ok boolean, p_failed integer)
returns void language sql security definer set search_path = '' as $$
  insert into public.paper_bot_runtime (id, last_run, ok, failed) values (true, p_at, p_ok, p_failed)
  on conflict (id) do update set previous_run = public.paper_bot_runtime.last_run,
      last_run = excluded.last_run, ok = excluded.ok, failed = excluded.failed
  where excluded.last_run > public.paper_bot_runtime.last_run;
$$;
revoke all on function public.paper_bot_heartbeat(bigint,boolean,integer) from public, anon, authenticated;
grant execute on function public.paper_bot_heartbeat(bigint,boolean,integer) to service_role;
commit;
