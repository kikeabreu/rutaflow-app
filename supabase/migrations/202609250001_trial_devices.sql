-- Anti-abuse for free trials: one trial per device (phone), not per user/email.
-- Users could register with 10 different emails on the same phone; this blocks that.

create table if not exists public.trial_devices (
  device_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);

create index if not exists idx_trial_devices_user on public.trial_devices(user_id);

alter table public.trial_devices enable row level security;

revoke all on public.trial_devices from anon, authenticated;
grant select on public.trial_devices to service_role;
grant insert on public.trial_devices to service_role;
