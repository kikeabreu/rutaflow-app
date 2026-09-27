-- Stripe's Customer Portal (current API versions) schedules cancellation via
-- `cancel_at` and leaves `cancel_at_period_end` false, so cancellations were
-- never detected. Profiles were also overwritten by whichever subscription's
-- event arrived last, so a user with two subscriptions flipped between states.
-- Profiles are now derived from all of the user's subscriptions.

alter table public.billing_subscriptions add column if not exists entitled boolean not null default false;

create or replace function public.refresh_profile_billing(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_entitled boolean;
  v_status text;
  v_until timestamptz;
  v_cancelling boolean;
begin
  select
    coalesce(bool_or(entitled), false),
    coalesce((array_agg(status order by updated_at desc) filter (where entitled))[1],
             (array_agg(status order by updated_at desc))[1]),
    max(current_period_end) filter (where entitled),
    coalesce(bool_and(cancel_at_period_end) filter (where entitled), false)
  into v_entitled, v_status, v_until, v_cancelling
  from billing_subscriptions
  where user_id = p_user_id;

  if v_status is null then return; end if;

  update profiles set
    plan = case when v_entitled then 'pro' else 'free' end,
    subscription_status = v_status,
    pro_until = v_until,
    cancel_at_period_end = v_cancelling,
    updated_at = now()
  where id = p_user_id;
end;
$$;

revoke all on function public.refresh_profile_billing(uuid) from public, anon, authenticated;
grant execute on function public.refresh_profile_billing(uuid) to service_role;

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

  insert into billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,price_id,current_period_end,cancel_at_period_end,entitled,last_event_created,updated_at)
    values(p_subscription_id,p_user_id,p_customer_id,p_status,p_price_id,p_current_period_end,p_cancel_at_period_end,p_entitled,p_event_created,now())
    on conflict(stripe_subscription_id) do update set status=excluded.status,price_id=excluded.price_id,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,entitled=excluded.entitled,last_event_created=excluded.last_event_created,updated_at=now();

  perform refresh_profile_billing(p_user_id);
  return true;
end;
$$;

-- Backfill existing subscriptions from the latest stored payload of each one.
with latest as (
  select distinct on (payload->'data'->'object'->>'id') payload->'data'->'object' as obj
  from billing_webhook_events
  where event_type like 'customer.subscription.%'
  order by payload->'data'->'object'->>'id', (payload->>'created')::bigint desc, processed_at desc
)
update billing_subscriptions bs set
  status = latest.obj->>'status',
  cancel_at_period_end = coalesce((latest.obj->>'cancel_at_period_end')::boolean, false) or (latest.obj->>'cancel_at') is not null,
  current_period_end = to_timestamp(coalesce((latest.obj->>'current_period_end')::bigint, (latest.obj->'items'->'data'->0->>'current_period_end')::bigint)),
  entitled = (latest.obj->>'status') in ('active','trialing')
from latest
where bs.stripe_subscription_id = latest.obj->>'id';

select public.refresh_profile_billing(user_id) from (select distinct user_id from public.billing_subscriptions) u;
