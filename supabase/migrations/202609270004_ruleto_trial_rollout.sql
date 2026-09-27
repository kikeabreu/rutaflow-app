-- Run once in Supabase SQL Editor, after migration 202609270003.
-- Existing users without a live Stripe subscription receive 14 days from execution.
-- Re-running does not extend the trial. This does not cancel Stripe subscriptions.
begin;

alter table public.profiles add column if not exists ruleto_trial_granted_at timestamptz;

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

  -- A late event from an ended subscription must not erase a local trial.
  if not v_entitled and exists (
    select 1 from profiles where id = p_user_id
      and plan = 'trialing' and subscription_status = 'trialing' and pro_until > now()
  ) then return; end if;

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


-- Serialize against subscription webhook writes while selecting the cohort.
lock table public.billing_subscriptions in share mode;

update public.profiles p set
  plan = 'trialing',
  subscription_status = 'trialing',
  pro_until = now() + interval '14 days',
  cancel_at_period_end = false,
  ruleto_trial_granted_at = now(),
  updated_at = now()
where p.ruleto_trial_granted_at is null
  and not exists (
    select 1 from public.billing_subscriptions s
    where s.user_id = p.id
      and (s.status not in ('canceled', 'incomplete_expired')
           or (s.entitled and s.current_period_end > now()))
  )
  -- Protect a paid status even if its subscription row has not synced yet.
  and p.subscription_status not in ('active', 'past_due', 'unpaid', 'incomplete', 'paused')
returning p.id, p.plan, p.subscription_status, p.pro_until;

commit;
