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
