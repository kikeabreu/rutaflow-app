-- Ruleto: una cuenta = un dispositivo a la vez, celular obligatorio y prueba
-- de 14 días ligada al dispositivo y al número (no solo al correo).
-- Ejecutar una vez en Supabase SQL Editor. Es idempotente.
begin;

-- ─── Perfil ──────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists phone_country text;
alter table public.profiles add column if not exists phone_updated_at timestamptz;
alter table public.profiles add column if not exists active_device_id text;
alter table public.profiles add column if not exists active_device_platform text;
alter table public.profiles add column if not exists active_device_label text;
alter table public.profiles add column if not exists active_device_seen_at timestamptz;
alter table public.profiles add column if not exists active_device_released boolean not null default false;
alter table public.profiles add column if not exists ruleto_trial_granted_at timestamptz;
alter table public.profiles add column if not exists cancel_at_period_end boolean not null default false;

-- Un número = una cuenta.
create unique index if not exists profiles_phone_unique on public.profiles(phone) where phone is not null;

-- ─── Registro de pruebas usadas ─────────────────────────────────────────────
-- Borrar la cuenta no debe liberar el dispositivo para otra prueba.
alter table public.trial_devices alter column user_id drop not null;
alter table public.trial_devices drop constraint if exists trial_devices_user_id_fkey;
alter table public.trial_devices add constraint trial_devices_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

create table if not exists public.trial_phones (
  phone text primary key,
  user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now()
);
alter table public.trial_phones enable row level security;
revoke all on public.trial_phones from anon, authenticated;

-- ─── Cambios de dispositivo ─────────────────────────────────────────────────
create table if not exists public.device_switches (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_device text,
  to_device text not null,
  switched_at timestamptz not null default now()
);
create index if not exists device_switches_user_recent on public.device_switches(user_id, switched_at desc);
alter table public.device_switches enable row level security;
revoke all on public.device_switches from anon, authenticated;

-- ─── El cliente no puede escribir plan, prueba, celular ni dispositivo ──────
-- La app hace upsert de `profiles` para guardar config; sin esto un usuario
-- podría ponerse plan='pro' o borrar su dispositivo activo desde la consola.
create or replace function public.protect_profile_managed_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plan := 'free';
    new.subscription_status := 'inactive';
    new.pro_until := null;
    new.cancel_at_period_end := false;
    new.ruleto_trial_granted_at := null;
    new.phone := null;
    new.phone_country := null;
    new.phone_updated_at := null;
    new.active_device_id := null;
    new.active_device_platform := null;
    new.active_device_label := null;
    new.active_device_seen_at := null;
    new.active_device_released := false;
  else
    new.plan := old.plan;
    new.subscription_status := old.subscription_status;
    new.pro_until := old.pro_until;
    new.cancel_at_period_end := old.cancel_at_period_end;
    new.ruleto_trial_granted_at := old.ruleto_trial_granted_at;
    new.phone := old.phone;
    new.phone_country := old.phone_country;
    new.phone_updated_at := old.phone_updated_at;
    new.active_device_id := old.active_device_id;
    new.active_device_platform := old.active_device_platform;
    new.active_device_label := old.active_device_label;
    new.active_device_seen_at := old.active_device_seen_at;
    new.active_device_released := old.active_device_released;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_managed_columns on public.profiles;
create trigger protect_profile_managed_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_managed_columns();

-- ─── Reclamar / verificar el dispositivo activo ─────────────────────────────
-- Devuelve {active:true} si este dispositivo puede usar la cuenta.
-- Con p_takeover=true mueve la cuenta aquí (cuenta como cambio).
create or replace function public.ruleto_claim_device(
  p_device_id text,
  p_platform text default null,
  p_label text default null,
  p_takeover boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile profiles%rowtype;
  v_max int := 3;
  v_window interval := interval '30 days';
  v_used int;
  v_platform text := left(coalesce(p_platform, ''), 20);
  v_label text := left(coalesce(p_label, ''), 80);
begin
  if v_uid is null then
    raise exception 'Sesión no válida' using errcode = '28000';
  end if;
  if p_device_id is null or p_device_id !~ '^[a-z]+:[A-Za-z0-9_-]{16,128}$' then
    raise exception 'Dispositivo inválido' using errcode = '22023';
  end if;

  select * into v_profile from profiles where id = v_uid for update;
  if not found then
    return jsonb_build_object('active', true, 'reason', 'no_profile');
  end if;

  -- Un dispositivo donde ya se usó una prueba no puede dar otra a otra cuenta.
  if v_profile.ruleto_trial_granted_at is not null or v_profile.plan = 'trialing' then
    insert into trial_devices(device_id, user_id) values (p_device_id, v_uid)
      on conflict (device_id) do nothing;
  end if;

  if v_profile.active_device_id is null or v_profile.active_device_id = p_device_id then
    update profiles set
      active_device_id = p_device_id,
      active_device_platform = v_platform,
      active_device_label = v_label,
      active_device_seen_at = now(),
      active_device_released = false
    where id = v_uid;
    return jsonb_build_object('active', true);
  end if;

  select count(*) into v_used from device_switches
    where user_id = v_uid and switched_at > now() - v_window;

  -- Tras cerrar sesión en el otro equipo no preguntamos, pero sí cuenta.
  if not p_takeover and not v_profile.active_device_released then
    return jsonb_build_object(
      'active', false,
      'other', jsonb_build_object(
        'platform', v_profile.active_device_platform,
        'label', v_profile.active_device_label,
        'seen_at', v_profile.active_device_seen_at
      ),
      'switches_left', greatest(v_max - v_used, 0),
      'max_switches', v_max,
      'limit_reached', v_used >= v_max
    );
  end if;

  if v_used >= v_max then
    return jsonb_build_object(
      'active', false,
      'limit_reached', true,
      'switches_left', 0,
      'max_switches', v_max,
      'other', jsonb_build_object(
        'platform', v_profile.active_device_platform,
        'label', v_profile.active_device_label,
        'seen_at', v_profile.active_device_seen_at
      )
    );
  end if;

  insert into device_switches(user_id, from_device, to_device)
    values (v_uid, v_profile.active_device_id, p_device_id);
  update profiles set
    active_device_id = p_device_id,
    active_device_platform = v_platform,
    active_device_label = v_label,
    active_device_seen_at = now(),
    active_device_released = false
  where id = v_uid;
  return jsonb_build_object('active', true, 'switched', true,
    'switches_left', greatest(v_max - v_used - 1, 0), 'max_switches', v_max);
end;
$$;

-- Al cerrar sesión: el siguiente equipo entra sin preguntar (pero cuenta).
create or replace function public.ruleto_release_device(p_device_id text)
returns void
language sql security definer set search_path = public
as $$
  update profiles set active_device_released = true
  where id = auth.uid() and active_device_id = p_device_id;
$$;

-- Usado por las APIs Pro (IA) para rechazar dispositivos que ya no son el activo.
create or replace function public.ruleto_device_allowed(p_device_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select active_device_id is null or active_device_id = p_device_id
       from profiles where id = auth.uid()),
    true);
$$;

-- ─── Registrar celular y, si procede, iniciar la prueba ─────────────────────
create or replace function public.ruleto_register_phone(
  p_phone text,
  p_country text,
  p_device_id text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile profiles%rowtype;
  v_reason text;
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'Sesión no válida' using errcode = '28000';
  end if;
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'error', 'phone_invalid');
  end if;
  if p_device_id is not null and p_device_id !~ '^[a-z]+:[A-Za-z0-9_-]{16,128}$' then
    raise exception 'Dispositivo inválido' using errcode = '22023';
  end if;

  select * into v_profile from profiles where id = v_uid for update;
  if not found then
    insert into profiles(id) values (v_uid);
    select * into v_profile from profiles where id = v_uid for update;
  end if;

  if exists (select 1 from profiles where phone = p_phone and id <> v_uid) then
    return jsonb_build_object('ok', false, 'error', 'phone_taken');
  end if;

  update profiles set
    phone = p_phone,
    phone_country = left(coalesce(p_country, ''), 2),
    phone_updated_at = now()
  where id = v_uid;

  -- ¿Le toca prueba?
  if v_profile.ruleto_trial_granted_at is not null or v_profile.plan in ('trialing', 'pro') then
    v_reason := 'already_used';
  elsif v_profile.subscription_status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused')
     or exists (select 1 from billing_subscriptions where user_id = v_uid) then
    v_reason := 'subscribed';
  elsif p_device_id is null then
    v_reason := 'no_device';
  elsif exists (select 1 from trial_phones where phone = p_phone and user_id is distinct from v_uid) then
    v_reason := 'phone_used';
  else
    insert into trial_devices(device_id, user_id) values (p_device_id, v_uid)
      on conflict (device_id) do nothing;
    if not found then
      v_reason := 'device_used';
    end if;
  end if;

  if v_reason is not null then
    -- Quien ya tuvo prueba deja marcado su número para que no la repita en otra cuenta.
    if v_reason = 'already_used' then
      insert into trial_phones(phone, user_id) values (p_phone, v_uid) on conflict (phone) do nothing;
    end if;
    return jsonb_build_object('ok', true, 'trial', jsonb_build_object('granted', false, 'reason', v_reason));
  end if;

  insert into trial_phones(phone, user_id) values (p_phone, v_uid) on conflict (phone) do nothing;
  v_until := now() + interval '14 days';
  update profiles set
    plan = 'trialing',
    subscription_status = 'trialing',
    pro_until = v_until,
    cancel_at_period_end = false,
    ruleto_trial_granted_at = now()
  where id = v_uid;
  return jsonb_build_object('ok', true, 'trial', jsonb_build_object('granted', true, 'until', v_until));
end;
$$;

revoke all on function public.ruleto_claim_device(text, text, text, boolean) from public, anon;
revoke all on function public.ruleto_release_device(text) from public, anon;
revoke all on function public.ruleto_device_allowed(text) from public, anon;
revoke all on function public.ruleto_register_phone(text, text, text) from public, anon;
grant execute on function public.ruleto_claim_device(text, text, text, boolean) to authenticated;
grant execute on function public.ruleto_release_device(text) to authenticated;
grant execute on function public.ruleto_device_allowed(text) to authenticated;
grant execute on function public.ruleto_register_phone(text, text, text) to authenticated;

commit;
