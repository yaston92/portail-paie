-- ============================================================
-- Portail paie : schéma initial
-- 4 rôles : admin_cabinet, collaborateur, client, salarie
-- Cloisonnement strict par RLS (dossier_id = client employeur)
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Types ----------

create type public.user_role as enum ('admin_cabinet', 'collaborateur', 'client', 'salarie');
create type public.contrat_type as enum ('cdi', 'cdd');
create type public.embauche_statut as enum ('envoye', 'retourne', 'valide');
create type public.campagne_statut as enum ('ouverte', 'cloturee_identique', 'envoyee');
create type public.saisie_mode as enum ('net', 'variables', 'ras');
create type public.absence_nature as enum ('cp', 'maladie', 'injustifiee', 'rtt', 'autre');
create type public.salarie_statut as enum ('actif', 'sorti');
create type public.upload_statut as enum ('en_controle', 'publie');

-- ---------- Tables ----------

-- Profils (miroir de auth.users, créé par trigger)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  nom text not null default '',
  prenom text not null default '',
  email text not null,
  telephone text,
  -- pour role = client : son dossier ; pour role = salarie : sa fiche
  dossier_id uuid,
  salarie_id uuid,
  created_at timestamptz not null default now()
);

-- Dossiers clients (un dossier = un client employeur)
create table public.dossiers (
  id uuid primary key default gen_random_uuid(),
  sigle text not null,
  raison_sociale text not null,
  email text,
  telephone text,
  collaborateur_id uuid references public.profiles (id) on delete set null,
  archive boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index dossiers_sigle_key on public.dossiers (upper(sigle));

alter table public.profiles
  add constraint profiles_dossier_fk foreign key (dossier_id) references public.dossiers (id) on delete set null;

-- Salariés
create table public.salaries (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  matricule text,
  nom text not null,
  prenom text not null,
  email text,
  date_entree date,
  date_sortie date,
  statut public.salarie_statut not null default 'actif',
  type_contrat public.contrat_type,
  cdd_duree text,
  duree_hebdo numeric(5, 2),
  poste text,
  opposition_bulletin boolean not null default false,
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index salaries_dossier_idx on public.salaries (dossier_id);

alter table public.profiles
  add constraint profiles_salarie_fk foreign key (salarie_id) references public.salaries (id) on delete set null;

-- Données sensibles (NIR chiffré côté application, AES-256-GCM)
-- Aucune policy : accessible uniquement via service role (API), avec journalisation.
create table public.salaries_sensibles (
  salarie_id uuid primary key references public.salaries (id) on delete cascade,
  nir_chiffre text,
  updated_at timestamptz not null default now()
);

-- Documents rattachés à un salarié (pièces d'embauche, fin de contrat…)
create table public.salarie_documents (
  id uuid primary key default gen_random_uuid(),
  salarie_id uuid not null references public.salaries (id) on delete cascade,
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  type_document text not null, -- piece_identite_recto | piece_identite_verso | carte_vitale | fin_contrat | autre
  chemin text not null,
  nom_fichier text not null,
  sensible boolean not null default false,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index salarie_documents_salarie_idx on public.salarie_documents (salarie_id);

-- Formulaires d'embauche
create table public.embauches (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  statut public.embauche_statut not null default 'envoye',
  nom text not null,
  prenom text not null,
  nir text, -- déplacé vers salaries_sensibles à la validation, puis effacé
  carte_vitale_chemin text,
  piece_identite_recto_chemin text not null,
  piece_identite_verso_chemin text not null,
  date_debut date not null,
  type_contrat public.contrat_type not null,
  cdd_duree text,
  duree_hebdo numeric(5, 2) not null,
  salaire numeric(12, 2),
  salaire_minimum boolean not null default false,
  poste text not null,
  note text,
  commentaire_retour text,
  salarie_id uuid references public.salaries (id) on delete set null,
  created_by uuid references public.profiles (id),
  validated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index embauches_dossier_idx on public.embauches (dossier_id);

-- Campagnes mensuelles de variables de paie
create table public.campagnes (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  mois date not null, -- premier jour du mois
  date_limite date not null,
  statut public.campagne_statut not null default 'ouverte',
  paies_identiques boolean,
  envoyee_at timestamptz,
  recap_chemin text,
  derniere_relance_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dossier_id, mois)
);
create index campagnes_mois_idx on public.campagnes (mois);

-- Saisie par salarié dans une campagne
create table public.saisies_variables (
  id uuid primary key default gen_random_uuid(),
  campagne_id uuid not null references public.campagnes (id) on delete cascade,
  salarie_id uuid not null references public.salaries (id) on delete cascade,
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  mode public.saisie_mode,
  net_montant numeric(12, 2),
  heures_supp numeric(6, 2),
  note text,
  updated_at timestamptz not null default now(),
  unique (campagne_id, salarie_id)
);
create index saisies_campagne_idx on public.saisies_variables (campagne_id);

-- Absences / congés saisis dans le calendrier
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  saisie_id uuid not null references public.saisies_variables (id) on delete cascade,
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  jour date not null,
  nature public.absence_nature not null,
  heures numeric(5, 2) not null,
  unique (saisie_id, jour)
);

-- Notes libres / fil de discussion (par mois et/ou par salarié)
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  campagne_id uuid references public.campagnes (id) on delete cascade,
  salarie_id uuid references public.salaries (id) on delete cascade,
  auteur_id uuid not null references public.profiles (id),
  contenu text not null default '',
  piece_chemin text,
  piece_nom text,
  created_at timestamptz not null default now()
);
create index notes_dossier_idx on public.notes (dossier_id);

-- Upload d'un PDF global de bulletins (avant découpage/contrôle)
create table public.bulletin_uploads (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  mois date not null,
  chemin text not null,
  nb_pages int,
  statut public.upload_statut not null default 'en_controle',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

-- Segments détectés dans le PDF global (écran de contrôle)
create table public.bulletin_segments (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.bulletin_uploads (id) on delete cascade,
  page_debut int not null,
  page_fin int not null,
  salarie_id uuid references public.salaries (id) on delete set null,
  cp_acquis numeric(7, 2),
  cp_pris numeric(7, 2),
  cp_restant numeric(7, 2),
  cp_acquis_n1 numeric(7, 2),
  cp_acquis_n numeric(7, 2),
  cp_pris_n1 numeric(7, 2),
  cp_pris_n numeric(7, 2),
  texte_apercu text
);

-- Bulletins publiés (un fichier par salarié et par mois)
create table public.bulletins (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  salarie_id uuid not null references public.salaries (id) on delete cascade,
  mois date not null,
  chemin text not null,
  nom_fichier text not null,
  upload_id uuid references public.bulletin_uploads (id) on delete set null,
  published_at timestamptz not null default now(),
  unique (salarie_id, mois)
);
create index bulletins_dossier_mois_idx on public.bulletins (dossier_id, mois);

-- Solde de congés payés (source de vérité : bulletin, repli manuel)
create table public.soldes_cp (
  salarie_id uuid primary key references public.salaries (id) on delete cascade,
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  acquis numeric(7, 2),
  pris numeric(7, 2),
  restant numeric(7, 2),
  acquis_n1 numeric(7, 2),
  acquis_n numeric(7, 2),
  pris_n1 numeric(7, 2),
  pris_n numeric(7, 2),
  source text not null default 'extraction', -- extraction | manuel
  mois_reference date,
  updated_at timestamptz not null default now()
);

create type public.demande_conge_statut as enum (
  'en_attente',
  'validee',
  'refusee',
  'annulee'
);

create table public.demandes_conge (
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
create index demandes_conge_salarie_idx on public.demandes_conge (salarie_id, created_at desc);
create index demandes_conge_dossier_statut_idx on public.demandes_conge (dossier_id, statut);

-- Journal d'audit (consultations de données sensibles, actions clés)
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  action text not null,
  cible_type text,
  cible_id text,
  dossier_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- Notifications in-app
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  titre text not null,
  corps text,
  lien text,
  lu boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, lu);

-- Durées de conservation paramétrables (RGPD)
create table public.retention_settings (
  type_document text primary key,
  duree_mois int not null,
  description text
);

insert into public.retention_settings (type_document, duree_mois, description) values
  ('piece_identite', 3, 'Pièces d''identité : supprimées après validation + délai'),
  ('carte_vitale', 3, 'Cartes vitales : supprimées après validation + délai'),
  ('bulletin', 600, 'Bulletins de paie : archivage longue durée (50 ans)'),
  ('fin_contrat', 60, 'Documents de fin de contrat'),
  ('note_piece', 24, 'Pièces jointes aux notes');

-- ---------- Trigger de création de profil ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, nom, prenom, email, telephone, dossier_id, salarie_id)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'salarie'),
    coalesce(new.raw_user_meta_data ->> 'nom', ''),
    coalesce(new.raw_user_meta_data ->> 'prenom', ''),
    new.email,
    new.raw_user_meta_data ->> 'telephone',
    nullif(new.raw_user_meta_data ->> 'dossier_id', '')::uuid,
    nullif(new.raw_user_meta_data ->> 'salarie_id', '')::uuid
  );
  -- Lier la fiche salarié à son compte
  if nullif(new.raw_user_meta_data ->> 'salarie_id', '') is not null then
    update public.salaries
      set profile_id = new.id
      where id = (new.raw_user_meta_data ->> 'salarie_id')::uuid;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Fonctions d'accès (RLS) ----------

create or replace function public.app_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.app_dossier_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select dossier_id from public.profiles where id = auth.uid();
$$;

create or replace function public.app_salarie_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select salarie_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_cabinet()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.app_role() in ('admin_cabinet', 'collaborateur');
$$;

-- Accès cabinet à un dossier : admin = tout, collaborateur = son portefeuille
create or replace function public.cabinet_has_dossier(d uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.app_role() = 'admin_cabinet'
    or (
      public.app_role() = 'collaborateur'
      and exists (select 1 from public.dossiers where id = d and collaborateur_id = auth.uid())
    );
$$;

-- Accès lecture à un dossier (cabinet ou client du dossier)
create or replace function public.can_read_dossier(d uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.cabinet_has_dossier(d)
    or (public.app_role() = 'client' and public.app_dossier_id() = d);
$$;

-- ---------- RLS ----------

alter table public.profiles enable row level security;
alter table public.dossiers enable row level security;
alter table public.salaries enable row level security;
alter table public.salaries_sensibles enable row level security;
alter table public.salarie_documents enable row level security;
alter table public.embauches enable row level security;
alter table public.campagnes enable row level security;
alter table public.saisies_variables enable row level security;
alter table public.absences enable row level security;
alter table public.notes enable row level security;
alter table public.bulletin_uploads enable row level security;
alter table public.bulletin_segments enable row level security;
alter table public.bulletins enable row level security;
alter table public.soldes_cp enable row level security;
alter table public.demandes_conge enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;
alter table public.retention_settings enable row level security;

-- profiles
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_cabinet());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid() and role = public.app_role());

-- dossiers
create policy dossiers_select on public.dossiers
  for select using (public.can_read_dossier(id));
create policy dossiers_admin_write on public.dossiers
  for all using (public.app_role() = 'admin_cabinet') with check (public.app_role() = 'admin_cabinet');

-- salaries : cabinet (portefeuille), client (son dossier), salarié (sa fiche)
create policy salaries_select on public.salaries
  for select using (
    public.can_read_dossier(dossier_id)
    or (public.app_role() = 'salarie' and id = public.app_salarie_id())
  );
create policy salaries_cabinet_write on public.salaries
  for all using (public.cabinet_has_dossier(dossier_id))
  with check (public.cabinet_has_dossier(dossier_id));

-- salaries_sensibles : AUCUNE policy (service role uniquement)

-- salarie_documents : cabinet + client du dossier (métadonnées ; le fichier passe par l'API)
create policy salarie_documents_select on public.salarie_documents
  for select using (public.can_read_dossier(dossier_id));
create policy salarie_documents_cabinet_write on public.salarie_documents
  for all using (public.cabinet_has_dossier(dossier_id))
  with check (public.cabinet_has_dossier(dossier_id));

-- embauches : le client crée et consulte pour son dossier ; le cabinet gère
create policy embauches_select on public.embauches
  for select using (public.can_read_dossier(dossier_id));
create policy embauches_client_insert on public.embauches
  for insert with check (
    public.app_role() = 'client' and dossier_id = public.app_dossier_id() and created_by = auth.uid()
  );
create policy embauches_client_update on public.embauches
  for update using (
    public.app_role() = 'client' and dossier_id = public.app_dossier_id() and statut = 'retourne'
  ) with check (dossier_id = public.app_dossier_id());
create policy embauches_cabinet_update on public.embauches
  for update using (public.cabinet_has_dossier(dossier_id))
  with check (public.cabinet_has_dossier(dossier_id));

-- campagnes : lecture cabinet + client ; écritures via API (verrouillage géré côté serveur)
create policy campagnes_select on public.campagnes
  for select using (public.can_read_dossier(dossier_id));
create policy campagnes_cabinet_write on public.campagnes
  for all using (public.cabinet_has_dossier(dossier_id))
  with check (public.cabinet_has_dossier(dossier_id));

-- saisies : le client saisit tant que la campagne est ouverte
create policy saisies_select on public.saisies_variables
  for select using (public.can_read_dossier(dossier_id));
create policy saisies_client_insert on public.saisies_variables
  for insert with check (
    public.app_role() = 'client'
    and dossier_id = public.app_dossier_id()
    and exists (select 1 from public.campagnes c where c.id = campagne_id and c.statut = 'ouverte')
  );
create policy saisies_client_update on public.saisies_variables
  for update using (
    public.app_role() = 'client'
    and dossier_id = public.app_dossier_id()
    and exists (select 1 from public.campagnes c where c.id = campagne_id and c.statut = 'ouverte')
  ) with check (dossier_id = public.app_dossier_id());
create policy saisies_cabinet_write on public.saisies_variables
  for all using (public.cabinet_has_dossier(dossier_id))
  with check (public.cabinet_has_dossier(dossier_id));

-- absences : mêmes règles que les saisies
create policy absences_select on public.absences
  for select using (public.can_read_dossier(dossier_id));
create policy absences_client_all on public.absences
  for all using (
    public.app_role() = 'client'
    and dossier_id = public.app_dossier_id()
    and exists (
      select 1 from public.saisies_variables s
      join public.campagnes c on c.id = s.campagne_id
      where s.id = saisie_id and c.statut = 'ouverte'
    )
  ) with check (dossier_id = public.app_dossier_id());
create policy absences_cabinet_write on public.absences
  for all using (public.cabinet_has_dossier(dossier_id))
  with check (public.cabinet_has_dossier(dossier_id));

-- notes : cabinet + client du dossier
create policy notes_select on public.notes
  for select using (public.can_read_dossier(dossier_id));
create policy notes_insert on public.notes
  for insert with check (
    auteur_id = auth.uid() and (
      public.cabinet_has_dossier(dossier_id)
      or (public.app_role() = 'client' and dossier_id = public.app_dossier_id())
    )
  );

-- bulletin_uploads / segments : cabinet uniquement
create policy bulletin_uploads_cabinet on public.bulletin_uploads
  for all using (public.cabinet_has_dossier(dossier_id))
  with check (public.cabinet_has_dossier(dossier_id));
create policy bulletin_segments_cabinet on public.bulletin_segments
  for all using (
    exists (select 1 from public.bulletin_uploads u where u.id = upload_id and public.cabinet_has_dossier(u.dossier_id))
  ) with check (
    exists (select 1 from public.bulletin_uploads u where u.id = upload_id and public.cabinet_has_dossier(u.dossier_id))
  );

-- bulletins : cabinet + client du dossier + salarié pour les siens
create policy bulletins_select on public.bulletins
  for select using (
    public.can_read_dossier(dossier_id)
    or (public.app_role() = 'salarie' and salarie_id = public.app_salarie_id())
  );
create policy bulletins_cabinet_write on public.bulletins
  for all using (public.cabinet_has_dossier(dossier_id))
  with check (public.cabinet_has_dossier(dossier_id));

-- soldes_cp : cabinet + client + salarié pour le sien
create policy soldes_select on public.soldes_cp
  for select using (
    public.can_read_dossier(dossier_id)
    or (public.app_role() = 'salarie' and salarie_id = public.app_salarie_id())
  );
create policy soldes_cabinet_write on public.soldes_cp
  for all using (public.cabinet_has_dossier(dossier_id))
  with check (public.cabinet_has_dossier(dossier_id));

-- demandes_conge : salarié (ses demandes) + client du dossier + cabinet
create policy demandes_conge_select on public.demandes_conge
  for select using (
    public.can_read_dossier(dossier_id)
    or (public.app_role() = 'salarie' and salarie_id = public.app_salarie_id())
  );
create policy demandes_conge_salarie_insert on public.demandes_conge
  for insert with check (
    public.app_role() = 'salarie'
    and salarie_id = public.app_salarie_id()
    and demandeur_id = auth.uid()
  );
create policy demandes_conge_update on public.demandes_conge
  for update using (
    public.can_read_dossier(dossier_id)
    or (
      public.app_role() = 'salarie'
      and salarie_id = public.app_salarie_id()
      and statut = 'en_attente'
    )
  );

-- audit_log : lecture admin uniquement (écriture via service role)
create policy audit_admin_select on public.audit_log
  for select using (public.app_role() = 'admin_cabinet');

-- notifications : chacun les siennes
create policy notifications_own on public.notifications
  for select using (user_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- retention_settings : lecture cabinet, écriture admin
create policy retention_select on public.retention_settings
  for select using (public.is_cabinet());
create policy retention_admin_write on public.retention_settings
  for all using (public.app_role() = 'admin_cabinet')
  with check (public.app_role() = 'admin_cabinet');

-- ---------- Buckets de stockage (privés, accès via API uniquement) ----------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false), ('bulletins', 'bulletins', false)
on conflict (id) do nothing;
