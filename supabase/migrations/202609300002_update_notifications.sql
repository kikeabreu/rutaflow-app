create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('android','web')),
  version_label text not null,
  build_number bigint not null check (build_number > 0),
  minimum_build bigint not null default 0 check (minimum_build >= 0 and minimum_build <= build_number),
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft','published','withdrawn')),
  artifact_url text,
  created_by uuid references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(platform,build_number)
);
create unique index if not exists app_releases_one_published on public.app_releases(platform) where status='published';
create table if not exists public.update_installations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android','web')),
  build_number bigint not null default 0,
  consent boolean not null default false,
  push_endpoint text,
  push_subscription jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(push_endpoint)
);
create index if not exists update_installations_user on public.update_installations(user_id);
create table if not exists public.update_campaigns (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.app_releases(id),
  kind text not null check (kind in ('test','broadcast')),
  status text not null default 'queued' check (status in ('queued','sending','completed','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists update_one_broadcast on public.update_campaigns(release_id) where kind='broadcast';
create table if not exists public.update_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.update_campaigns(id) on delete cascade,
  installation_id uuid not null references public.update_installations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','accepted','failed','skipped','cancelled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  provider_status integer,
  created_at timestamptz not null default now(),
  unique(campaign_id,installation_id)
);
create index if not exists update_deliveries_ready on public.update_deliveries(next_attempt_at) where status in ('pending','processing');
create table if not exists public.update_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  release_id uuid references public.app_releases(id),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.app_releases enable row level security;
alter table public.update_installations enable row level security;
alter table public.update_campaigns enable row level security;
alter table public.update_deliveries enable row level security;
alter table public.update_audit enable row level security;
revoke all on public.app_releases, public.update_installations, public.update_campaigns, public.update_deliveries, public.update_audit from anon, authenticated;
grant all on public.app_releases, public.update_installations, public.update_campaigns, public.update_deliveries, public.update_audit to service_role;
create or replace function public.claim_update_deliveries(p_limit integer default 50)
returns setof public.update_deliveries language sql security definer set search_path = public as $$
  update public.update_deliveries d set status='processing', locked_at=now(), attempts=d.attempts+1
  where d.id in (
    select q.id from public.update_deliveries q join public.update_campaigns c on c.id=q.campaign_id
    where c.status in ('queued','sending') and q.next_attempt_at <= now()
      and (q.status='pending' or (q.status='processing' and q.locked_at < now()-interval '5 minutes'))
    order by q.created_at limit least(greatest(p_limit,1),100) for update of q skip locked
  ) returning d.*;
$$;
revoke all on function public.claim_update_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_update_deliveries(integer) to service_role;

create or replace function public.publish_update_release(p_release_id uuid)
returns setof public.app_releases language plpgsql security definer set search_path = public as $$
declare target public.app_releases%rowtype;
begin
  select * into target from public.app_releases where id=p_release_id for update;
  if target.id is null or target.status<>'draft' then raise exception 'Release is not a draft'; end if;
  perform pg_advisory_xact_lock(hashtext(target.platform));
  update public.app_releases set status='withdrawn' where platform=target.platform and status='published';
  return query update public.app_releases set status='published',published_at=now() where id=p_release_id returning *;
end;
$$;
revoke all on function public.publish_update_release(uuid) from public, anon, authenticated;
grant execute on function public.publish_update_release(uuid) to service_role;
-- Requested panel administrator. app_metadata is server-managed; the client cannot grant itself this role.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"support_role":"admin"}'::jsonb
where lower(email) = 'e.abreuespinoza@gmail.com';
create or replace view public.update_campaign_stats as
select c.id as campaign_id,
  count(d.id) filter (where d.status='pending') as pending,
  count(d.id) filter (where d.status='processing') as processing,
  count(d.id) filter (where d.status='accepted') as accepted,
  count(d.id) filter (where d.status='failed') as failed,
  count(d.id) filter (where d.status='skipped') as skipped,
  count(d.id) filter (where d.status='cancelled') as cancelled
from public.update_campaigns c left join public.update_deliveries d on d.campaign_id=c.id
group by c.id;
revoke all on public.update_campaign_stats from public, anon, authenticated;
grant select on public.update_campaign_stats to service_role;
create or replace view public.update_release_observed as
select r.id as release_id, count(i.id) as observed
from public.app_releases r left join public.update_installations i
  on i.platform=r.platform and i.build_number>=r.build_number and i.last_seen_at>=r.published_at
group by r.id;
revoke all on public.update_release_observed from public, anon, authenticated;
grant select on public.update_release_observed to service_role;
