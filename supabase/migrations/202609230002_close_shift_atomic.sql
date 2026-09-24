-- Close one shift as one database transaction. The client supplies a stable
-- close ID so retrying after a lost response returns the same closure.
create or replace function public.close_shift_atomic(
  p_close_id uuid,
  p_active_day_id text,
  p_date date,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_total_ms bigint,
  p_trip_count integer,
  p_total_net numeric,
  p_total_km numeric,
  p_dead_km numeric,
  p_productive_pct numeric,
  p_snapshot jsonb
) returns public.shift_closures
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_active public.active_days%rowtype;
  v_closure public.shift_closures%rowtype;
begin
  if v_user_id is null then raise exception 'Sesión requerida'; end if;

  select * into v_closure from public.shift_closures
    where id = p_close_id and user_id = v_user_id;
  if found then return v_closure; end if;

  select * into v_active from public.active_days
    where user_id = v_user_id for update;
  if not found or v_active.id::text <> p_active_day_id then
    raise exception 'La jornada activa cambió; recarga antes de cerrarla';
  end if;

  insert into public.days (user_id,date,total_net,total_km,total_min,total_ms,trip_count)
  values (v_user_id,p_date,p_total_net,p_total_km,
    coalesce((p_snapshot->>'min')::numeric,0),p_total_ms,p_trip_count);

  insert into public.shift_closures (
    id,user_id,date,start_time,end_time,total_ms,trip_count,total_net,
    total_km,dead_km,productive_pct,snapshot
  ) values (
    p_close_id,v_user_id,p_date,p_start_time,p_end_time,p_total_ms,p_trip_count,
    p_total_net,p_total_km,p_dead_km,p_productive_pct,p_snapshot
  ) returning * into v_closure;

  delete from public.active_days where user_id = v_user_id and id = v_active.id;
  return v_closure;
end;
$$;

revoke all on function public.close_shift_atomic(
  uuid,text,date,timestamptz,timestamptz,bigint,integer,numeric,numeric,numeric,numeric,jsonb
) from public, anon;
grant execute on function public.close_shift_atomic(
  uuid,text,date,timestamptz,timestamptz,bigint,integer,numeric,numeric,numeric,numeric,jsonb
) to authenticated;
