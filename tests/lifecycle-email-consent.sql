-- Run with administrative SQL access after both lifecycle migrations.
-- All test records and changes are rolled back. Does not send any email.
begin;
do $$
declare
  opted uuid := gen_random_uuid();
  declined uuid := gen_random_uuid();
  malformed uuid := gen_random_uuid();
  token uuid;
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (opted,opted::text||'@example.invalid','{"lifecycle_email_enabled":true,"lifecycle_email_consent_version":"2026-10-07"}'),
    (declined,declined::text||'@example.invalid','{"lifecycle_email_enabled":false,"lifecycle_email_consent_version":"2026-10-07"}'),
    (malformed,malformed::text||'@example.invalid','{"lifecycle_email_enabled":"true","lifecycle_email_consent_version":"2026-10-07"}');
  if (select email_enabled from public.lifecycle_preferences where user_id=opted) is distinct from true
    then raise exception 'Explicit signup opt-in missing'; end if;
  if (select email_enabled from public.lifecycle_preferences where user_id=declined) is distinct from false
    then raise exception 'Declined signup was opted in'; end if;
  if exists(select 1 from public.lifecycle_preferences where user_id=malformed)
    then raise exception 'Nonboolean metadata accepted'; end if;
  perform set_config('request.jwt.claim.sub',opted::text,true);
  if public.get_lifecycle_email_preference()->>'email_enabled' is distinct from 'true'
    then raise exception 'Authenticated preference not readable'; end if;
  insert into public.lifecycle_deliveries(user_id,trial_started_at,campaign) values(opted,now(),'welcome');
  perform public.set_lifecycle_email_preference(false);
  if exists(select 1 from public.lifecycle_deliveries where user_id=opted and status='pending')
    then raise exception 'Unsubscribe did not cancel pending email'; end if;
  perform public.set_lifecycle_email_preference(true);
  select unsubscribe_token into token from public.lifecycle_preferences where user_id=opted;
  perform public.unsubscribe_lifecycle_email(token);
  update auth.users set raw_user_meta_data=raw_user_meta_data||'{"lifecycle_email_enabled":true}'::jsonb where id=opted;
  if (select email_enabled from public.lifecycle_preferences where user_id=opted) is distinct from false
    then raise exception 'Metadata edit reactivated an unsubscribe'; end if;
  if (select count(*) from public.lifecycle_consent_events where user_id=opted)<>4
    then raise exception 'Consent audit incomplete'; end if;
  if has_function_privilege('anon','public.get_lifecycle_email_preference()','execute')
    or has_table_privilege('authenticated','public.lifecycle_consent_events','select')
    then raise exception 'Consent access too broad'; end if;
end;
$$;
rollback;
