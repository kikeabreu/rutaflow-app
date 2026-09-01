alter table public.operational_events
  add column if not exists platform text not null default '';

alter table public.operational_events
  drop constraint if exists operational_events_type_check;

alter table public.operational_events
  add constraint operational_events_type_check
  check (type in ('dead_km', 'refuel', 'tank_checkpoint', 'tip'));
