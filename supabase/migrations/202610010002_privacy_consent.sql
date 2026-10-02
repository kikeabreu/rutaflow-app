-- Ruleto: registro de consentimientos del Aviso de Privacidad (LFPDPPP).
-- Cada aceptación o revocación es una fila nueva; la más reciente es el estado vigente.
-- Ejecutar una vez en Supabase SQL Editor. Es idempotente.
begin;

create table if not exists public.privacy_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_version text not null,
  accepted_terms boolean not null,
  accepted_financial boolean not null,
  accepted_location boolean not null,
  source text not null default 'app',
  created_at timestamptz not null default now()
);
create index if not exists privacy_consents_user_recent on public.privacy_consents(user_id, created_at desc);

alter table public.privacy_consents enable row level security;
revoke all on public.privacy_consents from anon, authenticated;
grant select on public.privacy_consents to authenticated;

drop policy if exists "privacy_consents_owner_read" on public.privacy_consents;
create policy "privacy_consents_owner_read" on public.privacy_consents
  for select to authenticated using (user_id = auth.uid());

-- El cliente no inserta directo: pasa por la función, que fija el usuario y valida.
create or replace function public.record_privacy_consent(
  p_notice_version text,
  p_accepted_location boolean,
  p_source text default 'app'
) returns public.privacy_consents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.privacy_consents;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  if coalesce(trim(p_notice_version), '') = '' then raise exception 'Versión del aviso requerida'; end if;
  insert into public.privacy_consents(user_id, notice_version, accepted_terms, accepted_financial, accepted_location, source)
  values (auth.uid(), left(p_notice_version, 40), true, true, coalesce(p_accepted_location, false), left(coalesce(p_source, 'app'), 40))
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.record_privacy_consent(text, boolean, text) from public, anon;
grant execute on function public.record_privacy_consent(text, boolean, text) to authenticated;

commit;
