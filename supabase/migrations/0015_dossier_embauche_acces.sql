-- SIRET + convention collective sur le dossier client.
alter table public.dossiers
  add column if not exists siret text,
  add column if not exists convention_collective text;

-- Embauche : brut/net, demande de rappel, champs facultatifs si accompagnement.
alter table public.embauches
  add column if not exists salaire_type text,
  add column if not exists accompagnement boolean not null default false;

alter table public.embauches
  drop constraint if exists embauches_salaire_type_check;
alter table public.embauches
  add constraint embauches_salaire_type_check
  check (salaire_type is null or salaire_type in ('brut', 'net'));

alter table public.embauches
  alter column piece_identite_recto_chemin drop not null,
  alter column piece_identite_verso_chemin drop not null,
  alter column date_debut drop not null,
  alter column type_contrat drop not null,
  alter column duree_hebdo drop not null,
  alter column poste drop not null;

-- Mot de passe provisoire posé par le cabinet : le client doit le changer.
alter table public.profiles
  add column if not exists doit_changer_mot_de_passe boolean not null default false;

create or replace function public.empecher_retrait_mdp_force()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Seul le service role (API) peut lever l'obligation, après changement effectif.
  if old.doit_changer_mot_de_passe
     and not new.doit_changer_mot_de_passe
     and auth.role() = 'authenticated' then
    new.doit_changer_mot_de_passe := true;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_mdp_force on public.profiles;
create trigger profiles_mdp_force
  before update on public.profiles
  for each row execute function public.empecher_retrait_mdp_force();
