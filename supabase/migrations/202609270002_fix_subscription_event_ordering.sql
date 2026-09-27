-- The conditional UPDATE on billing_subscriptions (guarded by
-- last_event_created, a unix-seconds timestamp) silently skipped whenever
-- Stripe sent multiple events for the same subscription within the same
-- second (common: cancelling fires several customer.subscription.updated
-- events almost simultaneously). When skipped, the function returned early
-- via "if not found then return true", never reaching the profiles UPDATE —
-- so cancel_at_period_end/pro_until silently stopped tracking reality after
-- the first event. Idempotency against reprocessing the same Stripe event is
-- already guaranteed by the unique event_id check earlier in the function,
-- so this extra ordering guard is dropped; last write wins.

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
    on conflict(stripe_subscription_id) do update set status=excluded.status,price_id=excluded.price_id,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,last_event_created=excluded.last_event_created,updated_at=now();

  insert into billing_entitlements(user_id,entitled,status,expires_at,updated_at)
    values(p_user_id,p_entitled,p_status,p_current_period_end,now())
    on conflict(user_id) do update set entitled=excluded.entitled,status=excluded.status,expires_at=excluded.expires_at,updated_at=now();

  update profiles set plan=case when p_entitled then 'pro' else 'free' end,
    subscription_status=p_status,pro_until=p_current_period_end,cancel_at_period_end=p_cancel_at_period_end,updated_at=now()
    where id=p_user_id;
  return true;
end;
$$;
