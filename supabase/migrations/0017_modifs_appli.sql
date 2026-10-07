-- Plusieurs collaborateurs en charge d'un dossier
create table if not exists public.dossier_collaborateurs (
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (dossier_id, profile_id)
);

insert into public.dossier_collaborateurs (dossier_id, profile_id)
select id, collaborateur_id
from public.dossiers
where collaborateur_id is not null
on conflict do nothing;

alter table public.dossier_collaborateurs enable row level security;

drop policy if exists dossier_collaborateurs_select on public.dossier_collaborateurs;
create policy dossier_collaborateurs_select on public.dossier_collaborateurs
  for select using (
    exists (
      select 1 from public.dossiers d
      where d.id = dossier_id
        and public.est_membre_cabinet(d.cabinet_id)
    )
  );

drop policy if exists dossier_collaborateurs_write on public.dossier_collaborateurs;
create policy dossier_collaborateurs_write on public.dossier_collaborateurs
  for all using (
    exists (
      select 1 from public.dossiers d
      where d.id = dossier_id
        and public.peut_admin_cabinet(d.cabinet_id)
    )
  )
  with check (
    exists (
      select 1 from public.dossiers d
      where d.id = dossier_id
        and public.peut_admin_cabinet(d.cabinet_id)
    )
  );

-- Un collaborateur voit le dossier s'il est affecté, même parmi plusieurs
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
        or dos.collaborateur_id = auth.uid()
        or exists (
          select 1 from public.dossier_collaborateurs dc
          where dc.dossier_id = dos.id and dc.profile_id = auth.uid()
        )
      )
  );
$$;

-- Rappel d'embauche levé après l'appel au client
alter table public.embauches
  add column if not exists rappel_traite_at timestamptz;

-- Arrêt marqué traité par le cabinet : il passe dans l'historique
alter table public.arrets_maladie
  add column if not exists traite_at timestamptz,
  add column if not exists traite_par uuid references public.profiles (id);

drop policy if exists arrets_maladie_update_cabinet on public.arrets_maladie;
create policy arrets_maladie_update_cabinet on public.arrets_maladie
  for update using (public.cabinet_has_dossier(dossier_id))
  with check (public.cabinet_has_dossier(dossier_id));

-- Campagne reçue, en attente de traitement cabinet
alter table public.campagnes
  add column if not exists traitee_at timestamptz;
