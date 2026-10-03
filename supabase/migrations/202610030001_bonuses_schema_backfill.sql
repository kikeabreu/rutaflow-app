alter table public.bonuses add column if not exists required_trips integer;
alter table public.bonuses add column if not exists completed_trips integer default 0;
alter table public.bonuses add column if not exists extra_km numeric default 0 check (extra_km >= 0);
alter table public.bonuses add column if not exists extra_min numeric default 0 check (extra_min >= 0);
alter table public.bonuses add column if not exists starts_at timestamptz;
alter table public.bonuses add column if not exists expires_at timestamptz;
alter table public.bonuses add column if not exists paid_at timestamptz;
alter table public.bonuses add column if not exists notes text not null default '';
alter table public.bonuses add column if not exists updated_at timestamptz not null default now();
alter table public.bonuses add column if not exists calculation_snapshot jsonb;
alter table public.bonuses add column if not exists client_mutation_id uuid;

update public.bonuses set completed_trips = 0 where completed_trips is null;

create index if not exists bonuses_user_status_idx
  on public.bonuses (user_id, status);

create unique index if not exists bonuses_user_mutation_unique
  on public.bonuses (user_id, client_mutation_id);
