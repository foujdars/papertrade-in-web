-- Run this file in Supabase SQL Editor before enabling Google login in production.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trading_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.trading_states enable row level security;

create policy "Users can read their profile"
on public.profiles for select using (auth.uid() = id);

create policy "Users can update their profile"
on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users can read their trading state"
on public.trading_states for select using (auth.uid() = user_id);

create policy "Users can create their trading state"
on public.trading_states for insert with check (auth.uid() = user_id);

create policy "Users can update their trading state"
on public.trading_states for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

