create extension if not exists pgcrypto;

create table if not exists public.location_checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('shift_start', 'trip_start', 'trip_end', 'shift_end')),
  trip_id text,
  day_id text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m integer check (accuracy_m is null or accuracy_m >= 0),
  zone text not null default '',
  city text not null default '',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists location_checkpoints_user_time_idx
  on public.location_checkpoints (user_id, captured_at desc);

create index if not exists location_checkpoints_trip_idx
  on public.location_checkpoints (user_id, trip_id);

alter table public.location_checkpoints enable row level security;

drop policy if exists "Users read own location checkpoints" on public.location_checkpoints;
create policy "Users read own location checkpoints"
  on public.location_checkpoints for select using (auth.uid() = user_id);

drop policy if exists "Users insert own location checkpoints" on public.location_checkpoints;
create policy "Users insert own location checkpoints"
  on public.location_checkpoints for insert with check (auth.uid() = user_id);

drop policy if exists "Users delete own location checkpoints" on public.location_checkpoints;
create policy "Users delete own location checkpoints"
  on public.location_checkpoints for delete using (auth.uid() = user_id);
