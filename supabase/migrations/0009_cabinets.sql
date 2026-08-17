-- ============================================================
-- 0009 : tables cabinets, backfill, RLS (après 0008 commitée)
-- Exécuter UNIQUEMENT après succès de 0008_cabinets.sql
-- ============================================================

-- Tables cabinets + membres
create table if not exists public.cabinets (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  archive boolean not null default false,
  created_at timestamptz not null default now()
);

do $$ begin
  create type public.cabinet_role_membre as enum ('admin', 'collaborateur');
exception when duplicate_object then null;
end $$;

create table if not exists public.cabinet_membres (
  cabinet_id uuid not null references public.cabinets (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role_membre public.cabinet_role_membre not null,
  created_at timestamptz not null default now(),
  primary key (cabinet_id, profile_id)
);
create index if not exists cabinet_membres_profile_idx
  on public.cabinet_membres (profile_id);

-- Backfill cabinet par défaut + dossiers.cabinet_id
insert into public.cabinets (id, nom)
select gen_random_uuid(), 'ETIK'
where not exists (select 1 from public.cabinets limit 1);

alter table public.dossiers
  add column if not exists cabinet_id uuid references public.cabinets (id);

update public.dossiers
set cabinet_id = (select id from public.cabinets order by created_at limit 1)
where cabinet_id is null;

alter table public.dossiers
  alter column cabinet_id set not null;

insert into public.cabinet_membres (cabinet_id, profile_id, role_membre)
select
  (select id from public.cabinets order by created_at limit 1),
  p.id,
  case
    when p.role = 'admin_cabinet' then 'admin'::public.cabinet_role_membre
    else 'collaborateur'::public.cabinet_role_membre
  end
from public.profiles p
where p.role in ('admin_cabinet', 'collaborateur')
on conflict do nothing;

-- Membres directeur (si déjà promus)
insert into public.cabinet_membres (cabinet_id, profile_id, role_membre)
select c.id, p.id, 'admin'::public.cabinet_role_membre
from public.profiles p
cross join public.cabinets c
where p.role = 'directeur' and c.archive = false
on conflict do nothing;

drop index if exists public.dossiers_sigle_key;
create unique index if not exists dossiers_cabinet_sigle_key
  on public.dossiers (cabinet_id, upper(sigle));

create index if not exists dossiers_cabinet_idx on public.dossiers (cabinet_id);

-- Helpers RLS
create or replace function public.is_cabinet()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.app_role() in ('directeur', 'admin_cabinet', 'collaborateur');
$$;

create or replace function public.is_directeur()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.app_role() = 'directeur';
$$;

create or replace function public.est_membre_cabinet(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.cabinet_membres m
    where m.cabinet_id = cid and m.profile_id = auth.uid()
  );
$$;

create or replace function public.role_dans_cabinet(cid uuid)
returns public.cabinet_role_membre
language sql stable security definer set search_path = public
as $$
  select m.role_membre
  from public.cabinet_membres m
  where m.cabinet_id = cid and m.profile_id = auth.uid()
  limit 1;
$$;

create or replace function public.peut_admin_cabinet(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.est_membre_cabinet(cid)
    and (
      public.app_role() = 'directeur'
      or public.role_dans_cabinet(cid) = 'admin'
      or public.app_role() = 'admin_cabinet'
    );
$$;

create or replace function public.cabinet_has_dossier(d uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.dossiers dos
    where dos.id = d
      and public.est_membre_cabinet(dos.cabinet_id)
      and (
        public.peut_admin_cabinet(dos.cabinet_id)
        or (
          public.role_dans_cabinet(dos.cabinet_id) = 'collaborateur'
          and dos.collaborateur_id = auth.uid()
        )
        or (
          public.app_role() = 'collaborateur'
          and dos.collaborateur_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.partage_un_cabinet_avec(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.cabinet_membres a
    join public.cabinet_membres b on b.cabinet_id = a.cabinet_id
    where a.profile_id = auth.uid() and b.profile_id = uid
  );
$$;

-- RLS cabinets / membres
alter table public.cabinets enable row level security;
alter table public.cabinet_membres enable row level security;

drop policy if exists cabinets_select on public.cabinets;
create policy cabinets_select on public.cabinets
  for select using (public.est_membre_cabinet(id));

drop policy if exists cabinets_directeur_insert on public.cabinets;
create policy cabinets_directeur_insert on public.cabinets
  for insert with check (public.is_directeur());

drop policy if exists cabinets_directeur_update on public.cabinets;
create policy cabinets_directeur_update on public.cabinets
  for update using (public.is_directeur() and public.est_membre_cabinet(id))
  with check (public.is_directeur());

drop policy if exists cabinet_membres_select on public.cabinet_membres;
create policy cabinet_membres_select on public.cabinet_membres
  for select using (
    public.est_membre_cabinet(cabinet_id)
    or profile_id = auth.uid()
  );

drop policy if exists cabinet_membres_admin_write on public.cabinet_membres;
create policy cabinet_membres_admin_write on public.cabinet_membres
  for all using (public.peut_admin_cabinet(cabinet_id))
  with check (public.peut_admin_cabinet(cabinet_id));

drop policy if exists cabinet_membres_directeur_self on public.cabinet_membres;
create policy cabinet_membres_directeur_self on public.cabinet_membres
  for insert with check (
    public.is_directeur()
    and profile_id = auth.uid()
    and role_membre = 'admin'
  );

-- Policies dossiers / profiles / audit / retention / demandes_conge
drop policy if exists dossiers_admin_write on public.dossiers;
create policy dossiers_admin_write on public.dossiers
  for all using (public.peut_admin_cabinet(cabinet_id))
  with check (public.peut_admin_cabinet(cabinet_id));

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (
    id = auth.uid()
    or public.partage_un_cabinet_avec(id)
    or (
      public.is_cabinet()
      and (
        (dossier_id is not null and public.cabinet_has_dossier(dossier_id))
        or (
          salarie_id is not null
          and exists (
            select 1 from public.salaries s
            where s.id = salarie_id and public.cabinet_has_dossier(s.dossier_id)
          )
        )
      )
    )
  );

drop policy if exists audit_admin_select on public.audit_log;
create policy audit_admin_select on public.audit_log
  for select using (
    public.app_role() in ('directeur', 'admin_cabinet')
    and (
      dossier_id is null
      or public.cabinet_has_dossier(dossier_id)
      or public.is_directeur()
    )
  );

drop policy if exists retention_admin_write on public.retention_settings;
create policy retention_admin_write on public.retention_settings
  for all using (
    public.app_role() in ('directeur', 'admin_cabinet')
  )
  with check (
    public.app_role() in ('directeur', 'admin_cabinet')
  );

drop policy if exists demandes_conge_salarie_select on public.demandes_conge;
drop policy if exists demandes_conge_select on public.demandes_conge;
create policy demandes_conge_select on public.demandes_conge
  for select to authenticated
  using (
    public.can_read_dossier(dossier_id)
    or (public.app_role() = 'salarie' and salarie_id = public.app_salarie_id())
  );

drop policy if exists demandes_conge_salarie_update on public.demandes_conge;
drop policy if exists demandes_conge_update on public.demandes_conge;
create policy demandes_conge_update on public.demandes_conge
  for update to authenticated
  using (
    public.can_read_dossier(dossier_id)
    or (
      public.app_role() = 'salarie'
      and salarie_id = public.app_salarie_id()
      and statut = 'en_attente'
    )
  );
