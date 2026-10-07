-- Permite avisar durante el registro que un celular ya pertenece a otra cuenta.
-- Solo devuelve un booleano; no expone a qué cuenta pertenece.
create or replace function public.ruleto_phone_available(p_phone text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_phone ~ '^\+[1-9][0-9]{7,14}$'
     and not exists (select 1 from profiles where phone = p_phone);
$$;
revoke all on function public.ruleto_phone_available(text) from public;
grant execute on function public.ruleto_phone_available(text) to anon, authenticated;
