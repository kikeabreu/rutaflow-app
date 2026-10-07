-- Ejecutar con acceso administrativo después de 20261007190000_lifecycle_pro_free.sql.
-- Todo se revierte y no se envía ningún correo.
begin;
do $$
declare
  pro_a uuid := gen_random_uuid(); pro_b uuid := gen_random_uuid(); pro_far uuid := gen_random_uuid();
  free_a uuid := gen_random_uuid(); free_b uuid := gen_random_uuid(); ex_paid uuid := gen_random_uuid();
  trial_u uuid := gen_random_uuid(); no_opt uuid := gen_random_uuid();
  meta text := '{"lifecycle_email_enabled":true,"lifecycle_email_consent_version":"2026-10-07"}';
  got jsonb; ids uuid[];
begin
  ids := array[pro_a,pro_b,pro_far,free_a,free_b,ex_paid,trial_u];
  for i in 1..array_length(ids,1) loop
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    values(ids[i],ids[i]::text||'@example.invalid',now(),meta::jsonb);
  end loop;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  values(no_opt,no_opt::text||'@example.invalid',now(),'{"lifecycle_email_enabled":false,"lifecycle_email_consent_version":"2026-10-07"}');

  insert into public.profiles(id,plan,subscription_status) select x,'pro','active' from unnest(array[pro_a,pro_b,pro_far,no_opt]) x
    on conflict(id) do update set plan='pro',subscription_status='active';
  insert into public.billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,entitled,cancel_at_period_end,current_period_end) values
    ('sub_a_'||pro_a,pro_a,'cus_a','active',true,false,now()+interval '2 days 12 hours'),
    ('sub_b_'||pro_b,pro_b,'cus_b','active',true,true,now()+interval '2 days 12 hours'),
    ('sub_f_'||pro_far,pro_far,'cus_f','active',true,false,now()+interval '10 days'),
    ('sub_n_'||no_opt,no_opt,'cus_n','active',true,false,now()+interval '2 days 12 hours');

  insert into public.profiles(id,plan,subscription_status,ruleto_trial_granted_at,pro_until) values
    (free_a,'free','canceled',now()-interval '30 days',now()-interval '14 days 12 hours'),
    (free_b,'free','canceled',now()-interval '45 days',now()-interval '30 days 12 hours'),
    (ex_paid,'free','canceled',now()-interval '30 days',now()-interval '14 days 12 hours'),
    (trial_u,'trialing','trialing',now()-interval '1 hour',now()+interval '14 days')
  on conflict(id) do update set plan=excluded.plan,subscription_status=excluded.subscription_status,
    ruleto_trial_granted_at=excluded.ruleto_trial_granted_at,pro_until=excluded.pro_until;
  insert into public.billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,entitled) values
    ('sub_x_'||ex_paid,ex_paid,'cus_x','canceled',false);

  if public.lifecycle_campaign(pro_a) is distinct from 'pro_renewal' then raise exception 'pro_renewal missing'; end if;
  if public.lifecycle_campaign(pro_b) is distinct from 'pro_canceling' then raise exception 'pro_canceling missing'; end if;
  if public.lifecycle_campaign(pro_far) is not null then raise exception 'Pro outside the window selected'; end if;
  if public.lifecycle_campaign(free_a) is distinct from 'free_recap' then raise exception 'free_recap missing'; end if;
  if public.lifecycle_campaign(free_b) is distinct from 'free_offer' then raise exception 'free_offer missing'; end if;
  if public.lifecycle_campaign(ex_paid) is not null then raise exception 'Former subscriber got a Free campaign'; end if;
  if public.lifecycle_campaign(trial_u) is distinct from 'welcome' then raise exception 'Trial welcome regressed'; end if;

  perform public.enqueue_lifecycle_email();
  if exists(select 1 from public.lifecycle_deliveries where user_id=no_opt) then raise exception 'Unopted user was queued'; end if;
  if (select count(*) from public.lifecycle_deliveries where user_id=any(ids) and status='pending')<>5
    then raise exception 'Expected five pending deliveries'; end if;

  begin perform public.claim_lifecycle_email('otro'); raise exception 'invalid segment accepted';
  exception when others then if sqlerrm='invalid segment accepted' then raise; end if; end;

  got := public.claim_lifecycle_email();
  if got->>'campaign' is distinct from 'welcome' then raise exception 'Trial claim returned %',got->>'campaign'; end if;
  perform public.finish_lifecycle_email((got->>'delivery_id')::uuid,'cancelled');

  for i in 1..4 loop
    got := public.claim_lifecycle_email('paid_free');
    if got is null or got->>'campaign' not in ('pro_renewal','pro_canceling','free_recap','free_offer')
      then raise exception 'paid_free claim wrong: %',got; end if;
    perform public.finish_lifecycle_email((got->>'delivery_id')::uuid,'sent');
  end loop;
  if public.claim_lifecycle_email('paid_free') is not null then raise exception 'Extra delivery claimed'; end if;

  if has_function_privilege('anon','public.claim_lifecycle_email(text)','execute')
    or has_function_privilege('authenticated','public.lifecycle_cohort(uuid)','execute')
    then raise exception 'Lifecycle functions too open'; end if;
end;
$$;
rollback;
