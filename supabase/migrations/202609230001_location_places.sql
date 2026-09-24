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
