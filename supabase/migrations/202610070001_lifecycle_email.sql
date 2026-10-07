-- Ruleto Drive: opt-in lifecycle email. Run after existing trial migrations.
begin;
create table public.lifecycle_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default false,
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
create table public.lifecycle_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trial_started_at timestamptz not null,
  campaign text not null check (campaign in ('welcome','activation','midpoint','ending','expired','return')),
  status text not null default 'pending' check (status in ('pending','processing','sent','cancelled','uncertain')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  unique(user_id,trial_started_at,campaign)
);
alter table public.lifecycle_preferences enable row level security;
alter table public.lifecycle_deliveries enable row level security;
revoke all on public.lifecycle_preferences,public.lifecycle_deliveries from anon,authenticated;
grant all on public.lifecycle_preferences,public.lifecycle_deliveries to service_role;
create index lifecycle_pending on public.lifecycle_deliveries(created_at) where status='pending';

-- Explicit opt-in only. Privacy acceptance and update-push permission aren't marketing consent.
create function public.set_lifecycle_email_preference(p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  insert into lifecycle_preferences(user_id,email_enabled) values(auth.uid(),coalesce(p_enabled,false))
  on conflict(user_id) do update set email_enabled=excluded.email_enabled,updated_at=now();
  if not coalesce(p_enabled,false) then
    update lifecycle_deliveries set status='cancelled' where user_id=auth.uid() and status='pending';
  end if;
end;
$$;
revoke all on function public.set_lifecycle_email_preference(boolean) from public,anon;
grant execute on function public.set_lifecycle_email_preference(boolean) to authenticated;

-- One cohort function shared by enqueue and final pre-send validation.
create function public.lifecycle_campaign(p_user_id uuid)
returns text language plpgsql stable security definer set search_path=public as $$
declare p public.profiles%rowtype; age interval; left_time interval;
begin
  select * into p from profiles where id=p_user_id;
  if not found or p.ruleto_trial_granted_at is null or p.pro_until is null then return null; end if;
  if lower(coalesce(p.plan,''))='pro' or lower(coalesce(p.subscription_status,'')) in ('active','past_due','unpaid','incomplete','paused')
     or exists(select 1 from billing_subscriptions where user_id=p_user_id and (entitled or status not in ('canceled','incomplete_expired'))) then return null; end if;
  age:=now()-p.ruleto_trial_granted_at;
  left_time:=p.pro_until-now();
  if age<interval '0' then return null; end if;
  if left_time>interval '0' and p.plan='trialing' then
    if age<interval '1 day' then return 'welcome'; end if;
    if age>=interval '2 days' and age<interval '3 days' and not exists(select 1 from trips where user_id=p_user_id) then return 'activation'; end if;
    if age>=interval '7 days' and age<interval '8 days' then return 'midpoint'; end if;
    if left_time<=interval '3 days' and left_time>interval '2 days' then return 'ending'; end if;
  elsif left_time<=interval '0' then
    if left_time>interval '-1 day' then return 'expired'; end if;
    if left_time<=interval '-7 days' and left_time>interval '-8 days'
       and not exists(select 1 from trips where user_id=p_user_id and created_at>=now()-interval '7 days') then return 'return'; end if;
  end if;
  return null;
end;
$$;

create function public.enqueue_lifecycle_email()
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  insert into lifecycle_deliveries(user_id,trial_started_at,campaign)
  select p.id,p.ruleto_trial_granted_at,c.campaign
  from profiles p join lifecycle_preferences pref on pref.user_id=p.id and pref.email_enabled
  join auth.users u on u.id=p.id and u.email_confirmed_at is not null and u.email is not null
  cross join lateral (select lifecycle_campaign(p.id) campaign) c
  where c.campaign is not null
  on conflict(user_id,trial_started_at,campaign) do nothing;
  get diagnostics n=row_count;
  return n;
end;
$$;

-- Claim ONE message per execution. Processing is never automatically resent:
-- SMTP acceptance followed by a lost acknowledgement could otherwise duplicate mail.
create function public.claim_lifecycle_email()
returns jsonb language plpgsql security definer set search_path=public as $$
declare d lifecycle_deliveries%rowtype; p profiles%rowtype; u auth.users%rowtype; token uuid; n bigint;
begin
  update lifecycle_deliveries set status='uncertain'
  where status='processing' and claimed_at<now()-interval '30 minutes';
  update lifecycle_deliveries q set status='cancelled'
  where q.status='pending' and (lifecycle_campaign(q.user_id) is distinct from q.campaign
    or not exists(select 1 from lifecycle_preferences where user_id=q.user_id and email_enabled));
  select q.* into d from lifecycle_deliveries q
  where q.status='pending'
    and not exists(select 1 from lifecycle_deliveries x where x.user_id=q.user_id and x.status in ('sent','processing','uncertain')
      and coalesce(x.sent_at,x.claimed_at)>now()-interval '36 hours')
  order by q.created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update lifecycle_deliveries set status='processing',claimed_at=now() where id=d.id;
  select * into p from profiles where id=d.user_id;
  select * into u from auth.users where id=d.user_id;
  select unsubscribe_token into token from lifecycle_preferences where user_id=d.user_id;
  select count(*) into n from trips where user_id=d.user_id and created_at>=d.trial_started_at;
  return jsonb_build_object('delivery_id',d.id,'campaign',d.campaign,'email',u.email,
    'name',coalesce(to_jsonb(p)->>'full_name',to_jsonb(p)->>'name','conductor'),
    'trial_until',p.pro_until,'trips_count',n,'unsubscribe_token',token);
end;
$$;

create function public.validate_lifecycle_email(p_delivery_id uuid,p_email text)
returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object('ok',exists(select 1 from lifecycle_deliveries d
    join lifecycle_preferences p on p.user_id=d.user_id and p.email_enabled
    join auth.users u on u.id=d.user_id and u.email_confirmed_at is not null
    where d.id=p_delivery_id and d.status='processing'
      and u.email=p_email
      and d.claimed_at>now()-interval '5 minutes' and lifecycle_campaign(d.user_id)=d.campaign));
$$;
create function public.finish_lifecycle_email(p_delivery_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('sent','cancelled','uncertain') then raise exception 'Estado inválido'; end if;
  update lifecycle_deliveries set status=p_status,sent_at=case when p_status='sent' then now() else null end
  where id=p_delivery_id and status='processing';
end;
$$;
create function public.unsubscribe_lifecycle_email(p_token uuid)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid;
begin
  update lifecycle_preferences set email_enabled=false,updated_at=now()
  where unsubscribe_token=p_token returning user_id into uid;
  if uid is not null then update lifecycle_deliveries set status='cancelled' where user_id=uid and status='pending'; end if;
end;
$$;

revoke all on function public.lifecycle_campaign(uuid),public.enqueue_lifecycle_email(),public.claim_lifecycle_email(),public.validate_lifecycle_email(uuid,text),public.finish_lifecycle_email(uuid,text),public.unsubscribe_lifecycle_email(uuid) from public,anon,authenticated;
grant execute on function public.lifecycle_campaign(uuid),public.enqueue_lifecycle_email(),public.claim_lifecycle_email(),public.validate_lifecycle_email(uuid,text),public.finish_lifecycle_email(uuid,text),public.unsubscribe_lifecycle_email(uuid) to service_role;
commit;
