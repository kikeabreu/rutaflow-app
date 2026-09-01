create extension if not exists pgcrypto;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nueva conversacion',
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_updated_idx
  on public.ai_conversations (user_id, updated_at desc);

alter table public.ai_conversations enable row level security;

drop policy if exists "Users read own AI conversations" on public.ai_conversations;
create policy "Users read own AI conversations"
  on public.ai_conversations for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own AI conversations" on public.ai_conversations;
create policy "Users insert own AI conversations"
  on public.ai_conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own AI conversations" on public.ai_conversations;
create policy "Users update own AI conversations"
  on public.ai_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own AI conversations" on public.ai_conversations;
create policy "Users delete own AI conversations"
  on public.ai_conversations for delete
  using (auth.uid() = user_id);

create table if not exists public.shift_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  start_time timestamptz,
  end_time timestamptz not null default now(),
  total_ms bigint not null default 0 check (total_ms >= 0),
  trip_count integer not null default 0 check (trip_count >= 0),
  total_net numeric not null default 0,
  total_km numeric not null default 0 check (total_km >= 0),
  dead_km numeric not null default 0 check (dead_km >= 0),
  productive_pct numeric not null default 0 check (productive_pct >= 0 and productive_pct <= 100),
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists shift_closures_user_date_idx
  on public.shift_closures (user_id, date desc, end_time desc);

alter table public.shift_closures enable row level security;

drop policy if exists "Users read own shift closures" on public.shift_closures;
create policy "Users read own shift closures"
  on public.shift_closures for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own shift closures" on public.shift_closures;
create policy "Users insert own shift closures"
  on public.shift_closures for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own shift closures" on public.shift_closures;
create policy "Users update own shift closures"
  on public.shift_closures for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own shift closures" on public.shift_closures;
create policy "Users delete own shift closures"
  on public.shift_closures for delete
  using (auth.uid() = user_id);
