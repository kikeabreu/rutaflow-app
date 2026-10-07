-- Correos de acompañamiento para usuarios Pro (con cobro) y Free (prueba terminada).
-- Reutiliza consentimiento, baja y límite de 36 horas. El flujo de la prueba no cambia:
-- claim_lifecycle_email() sigue sirviendo solo las seis campañas de la prueba.
begin;

alter table public.lifecycle_deliveries drop constraint lifecycle_deliveries_campaign_check;
alter table public.lifecycle_deliveries add constraint lifecycle_deliveries_campaign_check
  check (campaign in ('welcome','activation','midpoint','ending','expired','return',
                      'pro_renewal','pro_canceling','free_recap','free_offer'));

-- Campaña vigente y fecha ancla (única por usuario y campaña). Pro usa el fin del periodo de cobro.
create function public.lifecycle_cohort(p_user_id uuid)
returns table(campaign text, anchor timestamptz)
language plpgsql stable security definer set search_path=public as $$
declare p public.profiles%rowtype; s public.billing_subscriptions%rowtype;
        age interval; left_time interval; period_left interval;
begin
  select * into p from profiles where id=p_user_id;
  if not found then return; end if;

  select * into s from billing_subscriptions
   where user_id=p_user_id and entitled and status='active'
   order by current_period_end desc nulls last limit 1;
  if found then
    if s.current_period_end is not null then
      period_left:=s.current_period_end-now();
      if period_left>interval '2 days' and period_left<=interval '3 days' then
        campaign:=case when s.cancel_at_period_end then 'pro_canceling' else 'pro_renewal' end;
        anchor:=s.current_period_end;
        return next;
      end if;
    end if;
    return;
  end if;

  if p.ruleto_trial_granted_at is null or p.pro_until is null then return; end if;
  if lower(coalesce(p.plan,''))='pro' or lower(coalesce(p.subscription_status,'')) in ('active','past_due','unpaid','incomplete','paused')
     or exists(select 1 from billing_subscriptions where user_id=p_user_id and (entitled or status not in ('canceled','incomplete_expired'))) then return; end if;
  age:=now()-p.ruleto_trial_granted_at;
  left_time:=p.pro_until-now();
  if age<interval '0' then return; end if;
  anchor:=p.ruleto_trial_granted_at;
  if left_time>interval '0' and p.plan='trialing' then
    if age<interval '1 day' then campaign:='welcome';
    elsif age>=interval '2 days' and age<interval '3 days' and not exists(select 1 from trips where user_id=p_user_id) then campaign:='activation';
    elsif age>=interval '7 days' and age<interval '8 days' then campaign:='midpoint';
    elsif left_time<=interval '3 days' and left_time>interval '2 days' then campaign:='ending';
    end if;
  elsif left_time<=interval '0' then
    if left_time>interval '-1 day' then campaign:='expired';
    elsif left_time<=interval '-7 days' and left_time>interval '-8 days'
       and not exists(select 1 from trips where user_id=p_user_id and created_at>=now()-interval '7 days') then campaign:='return';
    elsif not exists(select 1 from billing_subscriptions where user_id=p_user_id) then
      if left_time<=interval '-14 days' and left_time>interval '-15 days' then campaign:='free_recap';
      elsif left_time<=interval '-30 days' and left_time>interval '-31 days' then campaign:='free_offer';
      end if;
    end if;
  end if;
  if campaign is not null then return next; end if;
end;
$$;

create or replace function public.lifecycle_campaign(p_user_id uuid)
returns text language sql stable security definer set search_path=public as $$
  select campaign from public.lifecycle_cohort(p_user_id) limit 1;
$$;

create or replace function public.enqueue_lifecycle_email()
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  insert into lifecycle_deliveries(user_id,trial_started_at,campaign)
  select p.id,c.anchor,c.campaign
  from profiles p join lifecycle_preferences pref on pref.user_id=p.id and pref.email_enabled
  join auth.users u on u.id=p.id and u.email_confirmed_at is not null and u.email is not null
  cross join lateral public.lifecycle_cohort(p.id) c
  where c.campaign is not null
  on conflict(user_id,trial_started_at,campaign) do nothing;
  get diagnostics n=row_count;
  return n;
end;
$$;

-- Un correo por ejecución. p_segment: 'trial' (flujo de la prueba, por defecto) o 'paid_free'.
drop function public.claim_lifecycle_email();
create function public.claim_lifecycle_email(p_segment text default 'trial')
returns jsonb language plpgsql security definer set search_path=public as $$
declare d lifecycle_deliveries%rowtype; p profiles%rowtype; u auth.users%rowtype; token uuid; n bigint; n30 bigint; pend timestamptz;
        campaigns text[];
begin
  campaigns:=case p_segment
    when 'trial' then array['welcome','activation','midpoint','ending','expired','return']
    when 'paid_free' then array['pro_renewal','pro_canceling','free_recap','free_offer']
    else null end;
  if campaigns is null then raise exception 'Segmento inválido'; end if;
  update lifecycle_deliveries set status='uncertain'
  where status='processing' and claimed_at<now()-interval '30 minutes';
  update lifecycle_deliveries q set status='cancelled'
  where q.status='pending' and (lifecycle_campaign(q.user_id) is distinct from q.campaign
    or not exists(select 1 from lifecycle_preferences where user_id=q.user_id and email_enabled));
  select q.* into d from lifecycle_deliveries q
  where q.status='pending' and q.campaign=any(campaigns)
    and not exists(select 1 from lifecycle_deliveries x where x.user_id=q.user_id and x.status in ('sent','processing','uncertain')
      and coalesce(x.sent_at,x.claimed_at)>now()-interval '36 hours')
  order by q.created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update lifecycle_deliveries set status='processing',claimed_at=now() where id=d.id;
  select * into p from profiles where id=d.user_id;
  select * into u from auth.users where id=d.user_id;
  select unsubscribe_token into token from lifecycle_preferences where user_id=d.user_id;
  select count(*) into n from trips where user_id=d.user_id and created_at>=d.trial_started_at;
  select count(*) into n30 from trips where user_id=d.user_id and created_at>=now()-interval '30 days';
  select current_period_end into pend from billing_subscriptions
   where user_id=d.user_id and entitled and status='active' order by current_period_end desc nulls last limit 1;
  return jsonb_build_object('delivery_id',d.id,'campaign',d.campaign,'email',u.email,
    'name',coalesce(to_jsonb(p)->>'full_name',to_jsonb(p)->>'name','conductor'),
    'trial_until',p.pro_until,'period_end',pend,'trips_count',n,'trips_30d',n30,'unsubscribe_token',token);
end;
$$;

revoke all on function public.lifecycle_cohort(uuid),public.claim_lifecycle_email(text) from public,anon,authenticated;
grant execute on function public.lifecycle_cohort(uuid),public.claim_lifecycle_email(text) to service_role;
commit;
