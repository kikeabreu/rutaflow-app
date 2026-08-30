create extension if not exists pgcrypto;

create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('dead_km', 'refuel', 'tank_checkpoint')),
  km numeric not null default 0 check (km >= 0),
  amount numeric not null default 0 check (amount >= 0),
  liters numeric not null default 0 check (liters >= 0),
  tank_liters numeric not null default 0 check (tank_liters >= 0),
  odometer numeric not null default 0 check (odometer >= 0),
  note text not null default '',
  date date not null default current_date,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists operational_events_user_date_idx
  on public.operational_events (user_id, date desc, occurred_at desc);

alter table public.operational_events enable row level security;

drop policy if exists "Users read own operational events" on public.operational_events;
create policy "Users read own operational events"
  on public.operational_events for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own operational events" on public.operational_events;
create policy "Users insert own operational events"
  on public.operational_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own operational events" on public.operational_events;
create policy "Users update own operational events"
  on public.operational_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own operational events" on public.operational_events;
create policy "Users delete own operational events"
  on public.operational_events for delete
  using (auth.uid() = user_id);
