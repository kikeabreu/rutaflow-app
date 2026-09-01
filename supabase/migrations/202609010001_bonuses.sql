create extension if not exists pgcrypto;

create table if not exists public.bonuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'uber',
  bonus_type text not null default 'racha',
  amount numeric not null default 0 check (amount >= 0),
  status text not null default 'active' check (status in ('active', 'earned', 'paid', 'lost')),
  required_trips integer,
  completed_trips integer default 0,
  extra_km numeric default 0 check (extra_km >= 0),
  extra_min numeric default 0 check (extra_min >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  paid_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bonuses_user_created_idx
  on public.bonuses (user_id, created_at desc);

create index if not exists bonuses_user_status_idx
  on public.bonuses (user_id, status);

alter table public.bonuses enable row level security;

drop policy if exists "Users read own bonuses" on public.bonuses;
create policy "Users read own bonuses"
  on public.bonuses for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own bonuses" on public.bonuses;
create policy "Users insert own bonuses"
  on public.bonuses for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own bonuses" on public.bonuses;
create policy "Users update own bonuses"
  on public.bonuses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own bonuses" on public.bonuses;
create policy "Users delete own bonuses"
  on public.bonuses for delete
  using (auth.uid() = user_id);
