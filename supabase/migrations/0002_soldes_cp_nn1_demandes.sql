-- Soldes CP détaillés N / N-1 + demandes de congés payés

alter table public.soldes_cp
  add column if not exists acquis_n1 numeric(7, 2),
  add column if not exists acquis_n numeric(7, 2),
  add column if not exists pris_n1 numeric(7, 2),
  add column if not exists pris_n numeric(7, 2);

alter table public.bulletin_segments
  add column if not exists cp_acquis_n1 numeric(7, 2),
  add column if not exists cp_acquis_n numeric(7, 2),
  add column if not exists cp_pris_n1 numeric(7, 2),
  add column if not exists cp_pris_n numeric(7, 2);

do $$ begin
  create type public.demande_conge_statut as enum (
    'en_attente',
    'validee',
    'refusee',
    'annulee'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.demandes_conge (
  id uuid primary key default gen_random_uuid(),
  salarie_id uuid not null references public.salaries (id) on delete cascade,
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  demandeur_id uuid not null references public.profiles (id),
  date_debut date not null,
  date_fin date not null,
  jours numeric(5, 2) not null,
  commentaire text,
  statut public.demande_conge_statut not null default 'en_attente',
  decideur_id uuid references public.profiles (id),
  decision_commentaire text,
  decided_at timestamptz,
  pending_sync jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demandes_conge_dates check (date_fin >= date_debut),
  constraint demandes_conge_jours check (jours > 0)
);

create index if not exists demandes_conge_salarie_idx
  on public.demandes_conge (salarie_id, created_at desc);
create index if not exists demandes_conge_dossier_statut_idx
  on public.demandes_conge (dossier_id, statut);

alter table public.demandes_conge enable row level security;

-- Salarié : voit / crée ses demandes ; annule si en_attente
drop policy if exists demandes_conge_salarie_select on public.demandes_conge;
create policy demandes_conge_salarie_select on public.demandes_conge
  for select to authenticated
  using (
    salarie_id = (select salarie_id from public.profiles where id = auth.uid())
    or dossier_id = (select dossier_id from public.profiles where id = auth.uid())
    or (select role from public.profiles where id = auth.uid()) in ('admin_cabinet', 'collaborateur')
  );

drop policy if exists demandes_conge_salarie_insert on public.demandes_conge;
create policy demandes_conge_salarie_insert on public.demandes_conge
  for insert to authenticated
  with check (
    demandeur_id = auth.uid()
    and salarie_id = (select salarie_id from public.profiles where id = auth.uid())
  );

drop policy if exists demandes_conge_salarie_update on public.demandes_conge;
create policy demandes_conge_salarie_update on public.demandes_conge
  for update to authenticated
  using (
    (
      salarie_id = (select salarie_id from public.profiles where id = auth.uid())
      and statut = 'en_attente'
    )
    or dossier_id = (select dossier_id from public.profiles where id = auth.uid())
    or (select role from public.profiles where id = auth.uid()) in ('admin_cabinet', 'collaborateur')
  );
