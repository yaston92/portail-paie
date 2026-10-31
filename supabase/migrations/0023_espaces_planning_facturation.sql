-- Vérification d'email des directeurs, planning optionnel,
-- un même email sur plusieurs espaces, export de facturation figé.

alter table public.profiles
  add column if not exists email_confirme boolean not null default true;

comment on column public.profiles.email_confirme is
  'false tant que le directeur n''a pas ouvert le lien envoyé à la création du cabinet.';

alter table public.dossiers
  add column if not exists planning_actif boolean not null default false;

comment on column public.dossiers.planning_actif is
  'Calendrier de présence. Désactivé tant que le client ne l''active pas.';

create table if not exists public.profil_espaces (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('salarie', 'client')),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  salarie_id uuid references public.salaries (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists profil_espaces_salarie_uk
  on public.profil_espaces (profile_id, salarie_id)
  where salarie_id is not null;

create unique index if not exists profil_espaces_client_uk
  on public.profil_espaces (profile_id, dossier_id)
  where kind = 'client';

comment on table public.profil_espaces is
  'Accès supplémentaires : salarié de plusieurs sociétés, ou espace client en plus d''un autre rôle.';

alter table public.profil_espaces enable row level security;

drop policy if exists profil_espaces_soi on public.profil_espaces;
create policy profil_espaces_soi on public.profil_espaces
  for select to authenticated
  using (profile_id = auth.uid());

grant select on public.profil_espaces to authenticated;
grant all on public.profil_espaces to service_role;

create table if not exists public.facturation_mois (
  id uuid primary key default gen_random_uuid(),
  cabinet_id uuid not null references public.cabinets (id) on delete cascade,
  mois date not null,
  lignes jsonb not null,
  genere_par uuid references public.profiles (id) on delete set null,
  genere_at timestamptz not null default now(),
  unique (cabinet_id, mois)
);

comment on table public.facturation_mois is
  'Export CSV de facturation figé : une génération par cabinet et par mois, sans recalcul.';

alter table public.facturation_mois enable row level security;

drop policy if exists facturation_mois_cabinet on public.facturation_mois;
create policy facturation_mois_cabinet on public.facturation_mois
  for select to authenticated
  using (
    exists (
      select 1 from public.cabinet_membres m
      where m.cabinet_id = facturation_mois.cabinet_id
        and m.profile_id = auth.uid()
    )
  );

grant select on public.facturation_mois to authenticated;
grant all on public.facturation_mois to service_role;
