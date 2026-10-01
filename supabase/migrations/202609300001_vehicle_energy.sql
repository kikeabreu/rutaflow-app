-- Expand first; the client is enabled only after this migration is deployed.
create table if not exists public.vehicle_energy_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vehicle_type text not null default 'combustion' check (vehicle_type in ('combustion','electric','hev','phev')),
  fuel_kind text not null default 'gasoline' check (fuel_kind in ('gasoline','diesel')),
  gas_price_per_liter numeric not null default 24 check (gas_price_per_liter >= 0),
  km_per_liter numeric not null default 12 check (km_per_liter > 0),
  electricity_price_per_kwh numeric not null default 3.5 check (electricity_price_per_kwh >= 0),
  kwh_per_100_km numeric not null default 14 check (kwh_per_100_km > 0),
  charging_loss_pct numeric not null default 0 check (charging_loss_pct between 0 and 100),
  electric_share_pct numeric not null default 50 check (electric_share_pct between 0 and 100),
  energy_unit text not null default 'kwh100' check (energy_unit in ('kwh100','kmperkwh')),
  revision bigint not null default 1 check (revision > 0),
  last_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vehicle_energy_profiles enable row level security;
revoke all on public.vehicle_energy_profiles from anon;
grant select, insert, update, delete on public.vehicle_energy_profiles to authenticated;
drop policy if exists "Read own energy profile" on public.vehicle_energy_profiles;
drop policy if exists "Insert own energy profile" on public.vehicle_energy_profiles;
drop policy if exists "Update own energy profile" on public.vehicle_energy_profiles;
drop policy if exists "Delete own energy profile" on public.vehicle_energy_profiles;
create policy "Read own energy profile" on public.vehicle_energy_profiles for select to authenticated using (auth.uid() = user_id);
create policy "Insert own energy profile" on public.vehicle_energy_profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "Update own energy profile" on public.vehicle_energy_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own energy profile" on public.vehicle_energy_profiles for delete to authenticated using (auth.uid() = user_id);

alter table public.trips add column if not exists calculation_snapshot jsonb;
alter table public.operational_events add column if not exists calculation_snapshot jsonb;
alter table public.operational_events add column if not exists kwh numeric;
alter table public.bonuses add column if not exists calculation_snapshot jsonb;
alter table public.active_days add column if not exists calculation_snapshot jsonb;
alter table public.operational_events alter column amount drop not null;
alter table public.operational_events drop constraint if exists operational_events_kwh_check;
alter table public.operational_events add constraint operational_events_kwh_check check (kwh is null or kwh > 0);
alter table public.operational_events drop constraint if exists operational_events_charge_values_check;

-- Replace the historical type check regardless of its generated name.
do $$ declare v_name text; begin
  for v_name in select conname from pg_constraint where conrelid = 'public.operational_events'::regclass
    and contype = 'c' and pg_get_constraintdef(oid) like '%type%' loop
    execute format('alter table public.operational_events drop constraint %I', v_name);
  end loop;
end $$;
alter table public.operational_events drop constraint if exists operational_events_type_energy_check;
alter table public.operational_events add constraint operational_events_type_energy_check
  check (type in ('dead_km','refuel','tank_checkpoint','tip','charge'));
alter table public.operational_events add constraint operational_events_charge_values_check
  check (type <> 'charge' or (amount is not null or kwh > 0));

-- Old clients may still write combustion records. They must not silently price
-- electric/hybrid records with gasoline, or erase a frozen calculation.
create or replace function public.guard_energy_snapshot() returns trigger
language plpgsql security invoker set search_path = public as $$
declare v_type text; v_cfg jsonb; v_requires_snapshot boolean := false;
begin
  if tg_op = 'UPDATE' then
    if old.calculation_snapshot is not null and
       new.calculation_snapshot is distinct from old.calculation_snapshot then
        raise exception 'El cálculo histórico no se puede reemplazar';
    end if;
  end if;
  if tg_table_name = 'trips' then
    v_requires_snapshot := true;
  elsif tg_table_name = 'operational_events' then
    v_requires_snapshot := new.type = 'dead_km';
  elsif tg_table_name = 'bonuses' then
    v_requires_snapshot := new.status in ('paid','earned');
  end if;
  if new.calculation_snapshot is null and v_requires_snapshot then
    select vehicle_type into v_type from public.vehicle_energy_profiles where user_id = new.user_id;
    if v_type is not null and v_type <> 'combustion' then
      raise exception 'Actualiza Ruleto para registrar este movimiento';
    end if;
    select config into v_cfg from public.profiles where id = new.user_id;
    new.calculation_snapshot := jsonb_build_object(
      'version',1,'source','legacy_client_estimate','vehicleType','combustion',
      'legacyConfig',coalesce(v_cfg,'{}'::jsonb),
      'operatingEnergyCostPerKm',
        coalesce(nullif((v_cfg->>'gasPricePerLiter')::numeric,0),24) /
        coalesce(nullif((v_cfg->>'kmPerLiter')::numeric,0),12));
  end if;
  return new;
end $$;
drop trigger if exists trips_energy_guard on public.trips;
drop trigger if exists events_energy_guard on public.operational_events;
drop trigger if exists bonuses_energy_guard on public.bonuses;
create trigger trips_energy_guard before insert or update on public.trips
  for each row execute function public.guard_energy_snapshot();
create trigger events_energy_guard before insert or update on public.operational_events
  for each row execute function public.guard_energy_snapshot();
create trigger bonuses_energy_guard before insert or update on public.bonuses
  for each row execute function public.guard_energy_snapshot();

create or replace function public.guard_active_day_energy() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.calculation_snapshot is null and exists (
    select 1 from public.vehicle_energy_profiles
    where user_id = new.user_id and vehicle_type <> 'combustion') then
    raise exception 'Actualiza Ruleto antes de iniciar la jornada';
  end if;
  if tg_op = 'UPDATE' then
    if old.calculation_snapshot is not null and
       new.calculation_snapshot is distinct from old.calculation_snapshot then
      raise exception 'El cálculo de la jornada no se puede reemplazar';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists active_day_energy_guard on public.active_days;
create trigger active_day_energy_guard before insert or update on public.active_days
  for each row execute function public.guard_active_day_energy();

-- Preserve a clearly marked estimate for rows which predate energy snapshots.
update public.trips t set calculation_snapshot = jsonb_build_object(
  'version',1,'source','migrated_estimate','vehicleType','combustion','legacyConfig',p.config,
  'operatingEnergyCostPerKm',
    coalesce(nullif((p.config->>'gasPricePerLiter')::numeric,0),24) /
    coalesce(nullif((p.config->>'kmPerLiter')::numeric,0),12))
from public.profiles p where t.user_id = p.id and t.calculation_snapshot is null;
update public.operational_events e set calculation_snapshot = jsonb_build_object(
  'version',1,'source','migrated_estimate','vehicleType','combustion','legacyConfig',p.config,
  'operatingEnergyCostPerKm',
    coalesce(nullif((p.config->>'gasPricePerLiter')::numeric,0),24) /
    coalesce(nullif((p.config->>'kmPerLiter')::numeric,0),12))
from public.profiles p where e.user_id = p.id and e.type = 'dead_km' and e.calculation_snapshot is null;

update public.bonuses b set calculation_snapshot = jsonb_build_object(
  'version',1,'source','migrated_estimate','vehicleType','combustion','legacyConfig',p.config,
  'operatingEnergyCostPerKm',
    coalesce(nullif((p.config->>'gasPricePerLiter')::numeric,0),24) /
    coalesce(nullif((p.config->>'kmPerLiter')::numeric,0),12))
from public.profiles p where b.user_id = p.id and b.status in ('paid','earned') and b.calculation_snapshot is null;

create or replace function public.save_vehicle_energy_profile(
  p_expected_revision bigint, p_mutation_id uuid, p_values jsonb
) returns public.vehicle_energy_profiles
language plpgsql security invoker set search_path = public as $$
declare v_user uuid := auth.uid(); v_row public.vehicle_energy_profiles%rowtype;
begin
  if v_user is null or p_mutation_id is null then raise exception 'Sesión e identificador requeridos'; end if;
  select * into v_row from public.vehicle_energy_profiles where user_id = v_user for update;
  if found and v_row.last_mutation_id = p_mutation_id then return v_row; end if;
  if coalesce(v_row.revision,0) <> p_expected_revision then raise exception 'Conflicto de revisión'; end if;
  if p_values->>'vehicle_type' <> 'combustion' and exists (
    select 1 from public.active_days where user_id = v_user and calculation_snapshot is null) then
    raise exception 'Cierra la jornada iniciada en una versión anterior antes de cambiar de vehículo';
  end if;
  if not found then
    insert into public.vehicle_energy_profiles(user_id) values(v_user) returning * into v_row;
  end if;
  update public.vehicle_energy_profiles set
    vehicle_type = p_values->>'vehicle_type', fuel_kind = p_values->>'fuel_kind',
    gas_price_per_liter = (p_values->>'gas_price_per_liter')::numeric,
    km_per_liter = (p_values->>'km_per_liter')::numeric,
    electricity_price_per_kwh = (p_values->>'electricity_price_per_kwh')::numeric,
    kwh_per_100_km = (p_values->>'kwh_per_100_km')::numeric,
    charging_loss_pct = (p_values->>'charging_loss_pct')::numeric,
    electric_share_pct = (p_values->>'electric_share_pct')::numeric,
    energy_unit = p_values->>'energy_unit',
    revision = p_expected_revision + 1, last_mutation_id = p_mutation_id, updated_at = now()
  where user_id = v_user returning * into v_row;
  return v_row;
end $$;
revoke all on function public.save_vehicle_energy_profile(bigint,uuid,jsonb) from public, anon;
grant execute on function public.save_vehicle_energy_profile(bigint,uuid,jsonb) to authenticated;
