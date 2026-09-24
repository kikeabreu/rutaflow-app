-- Native Android route samples. A continuity_id marks gaps where distance must
-- not be inferred between the last point and the next point.
create table if not exists public.location_samples (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  segment_id text not null,
  segment_type text not null check (segment_type in ('shift','dead_km','trip')),
  continuity_id text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision not null check (accuracy_m >= 0),
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists location_samples_user_session_time
  on public.location_samples (user_id,session_id,captured_at);
create index if not exists location_samples_user_segment_time
  on public.location_samples (user_id,segment_id,captured_at);

alter table public.location_samples enable row level security;
create policy "Users read own native location samples" on public.location_samples
  for select using (auth.uid() = user_id);
create policy "Users insert own native location samples" on public.location_samples
  for insert with check (auth.uid() = user_id);
create policy "Users update own native location samples" on public.location_samples
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
