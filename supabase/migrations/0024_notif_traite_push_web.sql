-- Suivi « traité / pas encore » et abonnements des navigateurs (bannière PC).

alter table public.notifications
  add column if not exists traite boolean;

update public.notifications
set traite = true
where traite is null;

alter table public.notifications
  alter column traite set default false;

alter table public.notifications
  alter column traite set not null;

create index if not exists notifications_user_traite_idx
  on public.notifications (user_id, traite);

create table if not exists public.web_push_abonnements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.web_push_abonnements enable row level security;

drop policy if exists web_push_own on public.web_push_abonnements;
create policy web_push_own on public.web_push_abonnements
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
