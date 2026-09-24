create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject text not null check (char_length(subject) between 4 and 160),
  category text not null check (category in ('account','sync','location','copilot','billing','other')),
  status text not null default 'open' check (status in ('open','waiting_user','in_progress','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  author_kind text not null default 'user' check (author_kind in ('user','support','system')),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.support_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 4 and 160),
  body text not null check (char_length(body) between 10 and 5000),
  status text not null default 'submitted' check (status in ('submitted','reviewing','planned','declined','shipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_user_created on public.support_tickets(user_id,created_at desc);
create index if not exists support_messages_ticket_created on public.support_messages(ticket_id,created_at);
create index if not exists support_suggestions_user_created on public.support_suggestions(user_id,created_at desc);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_suggestions enable row level security;

-- support_role vive en auth.users.raw_app_meta_data y no puede modificarlo el cliente.
-- service_role conserva bypass de RLS para procesos de backend.
create or replace function public.is_support_staff() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'support_role','') in ('agent','admin');
$$;

revoke all on function public.is_support_staff() from public, anon;
grant execute on function public.is_support_staff() to authenticated, service_role;

revoke all on public.support_tickets, public.support_messages, public.support_suggestions from anon;
-- Se conceden verbos a authenticated, pero RLS deja update/delete exclusivamente a
-- JWT emitidos por servidor con app_metadata.support_role. Los dueños no tienen policy
-- de update/delete y por tanto no pueden cambiar estado, prioridad ni autoría.
grant select,insert,update,delete on public.support_tickets, public.support_messages, public.support_suggestions to authenticated;
grant select,insert,update,delete on public.support_tickets, public.support_messages, public.support_suggestions to service_role;

create policy "ticket_owner_read" on public.support_tickets for select to authenticated using (user_id=auth.uid());
create policy "ticket_owner_create" on public.support_tickets for insert to authenticated with check (user_id=auth.uid() and status='open' and priority in ('low','normal'));
create policy "ticket_staff_all" on public.support_tickets for all to authenticated using (public.is_support_staff()) with check (public.is_support_staff());

create policy "message_owner_read" on public.support_messages for select to authenticated using (
  exists(select 1 from public.support_tickets ticket where ticket.id=ticket_id and ticket.user_id=auth.uid())
);
create policy "message_owner_create" on public.support_messages for insert to authenticated with check (
  author_id=auth.uid() and author_kind='user' and
  exists(select 1 from public.support_tickets ticket where ticket.id=ticket_id and ticket.user_id=auth.uid() and ticket.status not in ('closed'))
);
create policy "message_staff_all" on public.support_messages for all to authenticated using (public.is_support_staff()) with check (public.is_support_staff());

create policy "suggestion_owner_read" on public.support_suggestions for select to authenticated using (user_id=auth.uid());
create policy "suggestion_owner_create" on public.support_suggestions for insert to authenticated with check (user_id=auth.uid() and status='submitted');
create policy "suggestion_staff_all" on public.support_suggestions for all to authenticated using (public.is_support_staff()) with check (public.is_support_staff());
