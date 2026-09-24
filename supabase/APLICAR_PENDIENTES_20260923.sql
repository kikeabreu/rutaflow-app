-- =====================================================================
-- RutaFlow · Migraciones pendientes del 2026-09-23
-- =====================================================================
-- Estas 6 migraciones NUNCA se aplicaron al proyecto de producción.
-- Verificado por PostgREST: PGRST205 "Could not find the table in the
-- schema cache" para support_*, billing_*, location_places/samples y la
-- función close_shift_atomic.
--
-- CÓMO APLICARLO
--   Dashboard de Supabase -> SQL Editor -> pegar todo -> Run.
--
-- Todo corre dentro de UNA transacción: si algo falla, no queda nada a
-- medias. Las guardas de abajo abortan ANTES de escribir si los datos
-- existentes no soportan los nuevos constraints.
-- =====================================================================

begin;

-- ---------- GUARDA 1 ----------
-- El nuevo check de event_type valida las filas ya guardadas.
do $guard$
declare n bigint;
begin
  select count(*) into n from public.location_checkpoints
   where event_type not in ('shift_start','shift_end','trip_start','trip_end',
     'dead_km_start','dead_km_end','refuel','tank_checkpoint','tip','bonus');
  if n > 0 then
    raise exception 'ABORTADO: % filas de location_checkpoints tienen un event_type fuera de la lista nueva. Revísalas antes de aplicar.', n;
  end if;
end
$guard$;

-- ---------- GUARDA 2 ----------
-- Los índices únicos de client_mutation_id fallan si ya hay duplicados.
do $guard$
declare n bigint; t text;
begin
  foreach t in array array['trips','operational_events','bonuses'] loop
    execute format(
      'select count(*) from (select user_id, client_mutation_id from public.%I
         where client_mutation_id is not null group by 1,2 having count(*) > 1) x', t)
      into n;
    if n > 0 then
      raise exception 'ABORTADO: % duplicados de client_mutation_id en %. Límpialos antes de aplicar.', n, t;
    end if;
  end loop;
exception
  when undefined_column then null; -- La columna aún no existe: no hay duplicados posibles.
end
$guard$;


-- =====================================================================
-- 202609230001_location_places
-- =====================================================================
-- Preserve the original zone/city fields while adding more precise place data.
-- Apply only after confirming the earlier location_checkpoints and
-- operational_events migrations have been run on the target project.
alter table public.location_checkpoints
  add column if not exists operational_event_id uuid references public.operational_events(id) on delete set null,
  add column if not exists neighborhood text not null default '',
  add column if not exists neighborhood_type text not null default '',
  add column if not exists city_type text not null default '',
  add column if not exists municipality text not null default '',
  add column if not exists state text not null default '',
  add column if not exists place_status text not null default 'unknown',
  add column if not exists geocode_provider text not null default '';

alter table public.location_checkpoints
  drop constraint if exists location_checkpoints_event_type_check;

alter table public.location_checkpoints
  add constraint location_checkpoints_event_type_check
  check (event_type in (
    'shift_start', 'shift_end', 'trip_start', 'trip_end',
    'dead_km_start', 'dead_km_end', 'refuel', 'tank_checkpoint', 'tip', 'bonus'
  ));

alter table public.location_checkpoints
  drop constraint if exists location_checkpoints_place_status_check;

alter table public.location_checkpoints
  add constraint location_checkpoints_place_status_check
  check (place_status in ('unknown', 'pending', 'partial', 'resolved', 'historical_no_location'));

create index if not exists location_checkpoints_operation_idx
  on public.location_checkpoints (user_id, operational_event_id)
  where operational_event_id is not null;

drop policy if exists "Users update own location checkpoints" on public.location_checkpoints;
create policy "Users update own location checkpoints"
  on public.location_checkpoints for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.operational_events
  add column if not exists location_status text not null default 'unknown';

alter table public.operational_events
  drop constraint if exists operational_events_location_status_check;
alter table public.operational_events
  add constraint operational_events_location_status_check
  check (location_status in ('unknown', 'pending', 'captured', 'unavailable', 'historical_no_location'));

-- =====================================================================
-- 202609230002_close_shift_atomic
-- =====================================================================
-- Close one shift as one database transaction. The client supplies a stable
-- close ID so retrying after a lost response returns the same closure.
create or replace function public.close_shift_atomic(
  p_close_id uuid,
  p_active_day_id text,
  p_date date,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_total_ms bigint,
  p_trip_count integer,
  p_total_net numeric,
  p_total_km numeric,
  p_dead_km numeric,
  p_productive_pct numeric,
  p_snapshot jsonb
) returns public.shift_closures
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_active public.active_days%rowtype;
  v_closure public.shift_closures%rowtype;
begin
  if v_user_id is null then raise exception 'Sesión requerida'; end if;

  select * into v_closure from public.shift_closures
    where id = p_close_id and user_id = v_user_id;
  if found then return v_closure; end if;

  select * into v_active from public.active_days
    where user_id = v_user_id for update;
  if not found or v_active.id::text <> p_active_day_id then
    raise exception 'La jornada activa cambió; recarga antes de cerrarla';
  end if;

  insert into public.days (user_id,date,total_net,total_km,total_min,total_ms,trip_count)
  values (v_user_id,p_date,p_total_net,p_total_km,
    coalesce((p_snapshot->>'min')::numeric,0),p_total_ms,p_trip_count);

  insert into public.shift_closures (
    id,user_id,date,start_time,end_time,total_ms,trip_count,total_net,
    total_km,dead_km,productive_pct,snapshot
  ) values (
    p_close_id,v_user_id,p_date,p_start_time,p_end_time,p_total_ms,p_trip_count,
    p_total_net,p_total_km,p_dead_km,p_productive_pct,p_snapshot
  ) returning * into v_closure;

  delete from public.active_days where user_id = v_user_id and id = v_active.id;
  return v_closure;
end;
$$;

revoke all on function public.close_shift_atomic(
  uuid,text,date,timestamptz,timestamptz,bigint,integer,numeric,numeric,numeric,numeric,jsonb
) from public, anon;
grant execute on function public.close_shift_atomic(
  uuid,text,date,timestamptz,timestamptz,bigint,integer,numeric,numeric,numeric,numeric,jsonb
) to authenticated;

-- =====================================================================
-- 202609230003_billing
-- =====================================================================
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists subscription_status text not null default 'inactive';
alter table public.profiles add column if not exists pro_until timestamptz;

create table if not exists public.billing_subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  status text not null,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_created bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entitled boolean not null default false,
  source text not null default 'stripe',
  status text not null default 'inactive',
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_entitlements enable row level security;
alter table public.billing_webhook_events enable row level security;

revoke all on public.billing_customers, public.billing_subscriptions, public.billing_entitlements, public.billing_webhook_events from anon, authenticated;
grant select on public.billing_entitlements to authenticated;

drop policy if exists "users_read_own_entitlement" on public.billing_entitlements;
create policy "users_read_own_entitlement" on public.billing_entitlements
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.apply_stripe_subscription_event(
  p_event_id text, p_event_type text, p_event_created bigint, p_user_id uuid, p_customer_id text,
  p_subscription_id text, p_status text, p_price_id text,
  p_current_period_end timestamptz, p_cancel_at_period_end boolean,
  p_entitled boolean, p_payload jsonb
) returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  insert into billing_webhook_events(stripe_event_id,event_type,payload)
    values(p_event_id,p_event_type,p_payload)
    on conflict(stripe_event_id) do nothing;
  if not found then return false; end if;

  insert into billing_customers(user_id,stripe_customer_id,updated_at)
    values(p_user_id,p_customer_id,now())
    on conflict(user_id) do update set stripe_customer_id=excluded.stripe_customer_id,updated_at=now();
  insert into billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,price_id,current_period_end,cancel_at_period_end,last_event_created,updated_at)
    values(p_subscription_id,p_user_id,p_customer_id,p_status,p_price_id,p_current_period_end,p_cancel_at_period_end,p_event_created,now())
    on conflict(stripe_subscription_id) do update set status=excluded.status,price_id=excluded.price_id,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,last_event_created=excluded.last_event_created,updated_at=now()
    where billing_subscriptions.last_event_created <= excluded.last_event_created;
  if not found then return true; end if;
  insert into billing_entitlements(user_id,entitled,status,expires_at,updated_at)
    values(p_user_id,p_entitled,p_status,p_current_period_end,now())
    on conflict(user_id) do update set entitled=excluded.entitled,status=excluded.status,expires_at=excluded.expires_at,updated_at=now();

  update profiles set plan=case when p_entitled then 'pro' else 'free' end,
    subscription_status=p_status,pro_until=p_current_period_end,updated_at=now()
    where id=p_user_id;
  return true;
end;
$$;

revoke all on function public.apply_stripe_subscription_event(text,text,bigint,uuid,text,text,text,text,timestamptz,boolean,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_event(text,text,bigint,uuid,text,text,text,text,timestamptz,boolean,boolean,jsonb) to service_role;

-- =====================================================================
-- 202609230004_offline_mutations
-- =====================================================================
-- A retry after losing a network response must return the original row.
-- PostgreSQL UNIQUE permits multiple NULLs for historical rows.
alter table public.trips add column if not exists client_mutation_id uuid;
alter table public.operational_events add column if not exists client_mutation_id uuid;
alter table public.bonuses add column if not exists client_mutation_id uuid;

create unique index if not exists trips_user_mutation_unique
  on public.trips (user_id, client_mutation_id);
create unique index if not exists operational_events_user_mutation_unique
  on public.operational_events (user_id, client_mutation_id);
create unique index if not exists bonuses_user_mutation_unique
  on public.bonuses (user_id, client_mutation_id);

-- =====================================================================
-- 202609230005_support
-- =====================================================================
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject text not null check (char_length(subject) between 4 and 160),
  category text not null check (category in ('account','sync','location','copilot','billing','other')),
  status text not null default 'open' check (status in ('open','waiting_user','in_progress','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  author_kind text not null default 'user' check (author_kind in ('user','support','system')),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.support_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 4 and 160),
  body text not null check (char_length(body) between 10 and 5000),
  status text not null default 'submitted' check (status in ('submitted','reviewing','planned','declined','shipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_user_created on public.support_tickets(user_id,created_at desc);
create index if not exists support_messages_ticket_created on public.support_messages(ticket_id,created_at);
create index if not exists support_suggestions_user_created on public.support_suggestions(user_id,created_at desc);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_suggestions enable row level security;

-- support_role vive en auth.users.raw_app_meta_data y no puede modificarlo el cliente.
-- service_role conserva bypass de RLS para procesos de backend.
create or replace function public.is_support_staff() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'support_role','') in ('agent','admin');
$$;

revoke all on function public.is_support_staff() from public, anon;
grant execute on function public.is_support_staff() to authenticated, service_role;

revoke all on public.support_tickets, public.support_messages, public.support_suggestions from anon;
-- Se conceden verbos a authenticated, pero RLS deja update/delete exclusivamente a
-- JWT emitidos por servidor con app_metadata.support_role. Los dueños no tienen policy
-- de update/delete y por tanto no pueden cambiar estado, prioridad ni autoría.
grant select,insert,update,delete on public.support_tickets, public.support_messages, public.support_suggestions to authenticated;
grant select,insert,update,delete on public.support_tickets, public.support_messages, public.support_suggestions to service_role;

drop policy if exists "ticket_owner_read" on public.support_tickets;
create policy "ticket_owner_read" on public.support_tickets for select to authenticated using (user_id=auth.uid());
drop policy if exists "ticket_owner_create" on public.support_tickets;
create policy "ticket_owner_create" on public.support_tickets for insert to authenticated with check (user_id=auth.uid() and status='open' and priority in ('low','normal'));
drop policy if exists "ticket_staff_all" on public.support_tickets;
create policy "ticket_staff_all" on public.support_tickets for all to authenticated using (public.is_support_staff()) with check (public.is_support_staff());

drop policy if exists "message_owner_read" on public.support_messages;
create policy "message_owner_read" on public.support_messages for select to authenticated using (
  exists(select 1 from public.support_tickets ticket where ticket.id=ticket_id and ticket.user_id=auth.uid())
);
drop policy if exists "message_owner_create" on public.support_messages;
create policy "message_owner_create" on public.support_messages for insert to authenticated with check (
  author_id=auth.uid() and author_kind='user' and
  exists(select 1 from public.support_tickets ticket where ticket.id=ticket_id and ticket.user_id=auth.uid() and ticket.status not in ('closed'))
);
drop policy if exists "message_staff_all" on public.support_messages;
create policy "message_staff_all" on public.support_messages for all to authenticated using (public.is_support_staff()) with check (public.is_support_staff());

drop policy if exists "suggestion_owner_read" on public.support_suggestions;
create policy "suggestion_owner_read" on public.support_suggestions for select to authenticated using (user_id=auth.uid());
drop policy if exists "suggestion_owner_create" on public.support_suggestions;
create policy "suggestion_owner_create" on public.support_suggestions for insert to authenticated with check (user_id=auth.uid() and status='submitted');
drop policy if exists "suggestion_staff_all" on public.support_suggestions;
create policy "suggestion_staff_all" on public.support_suggestions for all to authenticated using (public.is_support_staff()) with check (public.is_support_staff());

-- =====================================================================
-- 202609230006_location_samples
-- =====================================================================
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
drop policy if exists "Users read own native location samples" on public.location_samples;
create policy "Users read own native location samples" on public.location_samples
  for select using (auth.uid() = user_id);
drop policy if exists "Users insert own native location samples" on public.location_samples;
create policy "Users insert own native location samples" on public.location_samples
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users update own native location samples" on public.location_samples;
create policy "Users update own native location samples" on public.location_samples
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;

-- Verifica después con: select to_regclass('public.support_tickets');
