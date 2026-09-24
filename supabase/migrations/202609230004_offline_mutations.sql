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
