-- Un compte cabinet peut aussi ouvrir l'espace client d'un dossier (même email).
alter table public.profiles
  add column if not exists dossier_client_id uuid references public.dossiers (id) on delete set null;

create index if not exists profiles_dossier_client_idx
  on public.profiles (dossier_client_id);

-- Seul le serveur (service role) peut lier ou retirer cet accès.
create or replace function public.bloquer_dossier_client_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dossier_client_id is distinct from old.dossier_client_id
     and coalesce(auth.role(), '') <> 'service_role' then
    new.dossier_client_id := old.dossier_client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_dossier_client_id on public.profiles;
create trigger profiles_dossier_client_id
  before update on public.profiles
  for each row execute function public.bloquer_dossier_client_id();

create or replace function public.est_client_du_dossier(d uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        (p.role = 'client' and p.dossier_id = d)
        or p.dossier_client_id = d
      )
  );
$$;

create or replace function public.can_read_dossier(d uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cabinet_has_dossier(d)
    or public.est_client_du_dossier(d);
$$;

-- Écritures client pour le compte lié (les policies s'ajoutent à celles du rôle client).
drop policy if exists embauches_client_lie on public.embauches;
create policy embauches_client_lie on public.embauches
  for all using (public.est_client_du_dossier(dossier_id))
  with check (public.est_client_du_dossier(dossier_id));

drop policy if exists saisies_client_lie on public.saisies_variables;
create policy saisies_client_lie on public.saisies_variables
  for all using (public.est_client_du_dossier(dossier_id))
  with check (public.est_client_du_dossier(dossier_id));

drop policy if exists absences_client_lie on public.absences;
create policy absences_client_lie on public.absences
  for all using (public.est_client_du_dossier(dossier_id))
  with check (public.est_client_du_dossier(dossier_id));

drop policy if exists notes_client_lie on public.notes;
create policy notes_client_lie on public.notes
  for all using (public.est_client_du_dossier(dossier_id))
  with check (public.est_client_du_dossier(dossier_id));

drop policy if exists arrets_client_lie on public.arrets_maladie;
create policy arrets_client_lie on public.arrets_maladie
  for all using (public.est_client_du_dossier(dossier_id))
  with check (public.est_client_du_dossier(dossier_id));

drop policy if exists conges_client_lie on public.demandes_conge;
create policy conges_client_lie on public.demandes_conge
  for all using (public.est_client_du_dossier(dossier_id))
  with check (public.est_client_du_dossier(dossier_id));

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete using (user_id = auth.uid());
