begin;
create table public.lifecycle_consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email_enabled boolean not null,
  consent_version text not null,
  source text not null check (source in ('signup','settings','email_unsubscribe')),
  created_at timestamptz not null default now()
);
create index lifecycle_consent_events_user on public.lifecycle_consent_events(user_id,created_at desc);
alter table public.lifecycle_consent_events enable row level security;
revoke all on public.lifecycle_consent_events from public,anon,authenticated;
grant all on public.lifecycle_consent_events to service_role;
grant usage,select on sequence public.lifecycle_consent_events_id_seq to service_role;

create or replace function public.get_lifecycle_email_preference()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  return jsonb_build_object('email_enabled',coalesce((select email_enabled from public.lifecycle_preferences where user_id=auth.uid()),false));
end;
$$;
revoke all on function public.get_lifecycle_email_preference() from public,anon;
grant execute on function public.get_lifecycle_email_preference() to authenticated;

create or replace function public.set_lifecycle_email_preference(p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Sesión requerida'; end if;
  insert into public.lifecycle_preferences(user_id,email_enabled) values(uid,coalesce(p_enabled,false))
  on conflict(user_id) do update set email_enabled=excluded.email_enabled,updated_at=now();
  insert into public.lifecycle_consent_events(user_id,email_enabled,consent_version,source)
  values(uid,coalesce(p_enabled,false),'2026-10-07','settings');
  if not coalesce(p_enabled,false) then
    update public.lifecycle_deliveries set status='cancelled' where user_id=uid and status='pending';
  end if;
end;
$$;
revoke all on function public.set_lifecycle_email_preference(boolean) from public,anon;
grant execute on function public.set_lifecycle_email_preference(boolean) to authenticated;

-- Copy the explicit registration choice only ON INSERT. Later edits to auth
-- metadata or another login must never reactivate a recipient who unsubscribed.
create function public.capture_signup_lifecycle_preference()
returns trigger language plpgsql security definer set search_path='' as $$
declare opted_in boolean;
begin
  if new.raw_user_meta_data->>'lifecycle_email_consent_version' is distinct from '2026-10-07'
     or jsonb_typeof(new.raw_user_meta_data->'lifecycle_email_enabled') is distinct from 'boolean' then return new; end if;
  opted_in:=new.raw_user_meta_data->'lifecycle_email_enabled'='true'::jsonb;
  insert into public.lifecycle_preferences(user_id,email_enabled) values(new.id,opted_in) on conflict(user_id) do nothing;
  insert into public.lifecycle_consent_events(user_id,email_enabled,consent_version,source)
  values(new.id,opted_in,'2026-10-07','signup');
  return new;
end;
$$;
revoke all on function public.capture_signup_lifecycle_preference() from public,anon,authenticated;
create trigger ruleto_capture_signup_lifecycle_preference
after insert on auth.users for each row execute function public.capture_signup_lifecycle_preference();

create or replace function public.unsubscribe_lifecycle_email(p_token uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
  update public.lifecycle_preferences set email_enabled=false,updated_at=now()
  where unsubscribe_token=p_token returning user_id into uid;
  if uid is not null then
    insert into public.lifecycle_consent_events(user_id,email_enabled,consent_version,source)
    values(uid,false,'2026-10-07','email_unsubscribe');
    update public.lifecycle_deliveries set status='cancelled' where user_id=uid and status='pending';
  end if;
end;
$$;
revoke all on function public.unsubscribe_lifecycle_email(uuid) from public,anon,authenticated;
grant execute on function public.unsubscribe_lifecycle_email(uuid) to service_role;
commit;
