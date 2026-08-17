-- Index perf supplémentaires (listes / relances / accès)

-- Clients d'un dossier (invitation, notifications)
create index if not exists profiles_dossier_role_idx
  on public.profiles (dossier_id, role)
  where dossier_id is not null;

-- Filtres dashboard / portefeuille collaborateur
create index if not exists dossiers_archive_collab_idx
  on public.dossiers (archive, collaborateur_id);

-- Relances campagnes ouvertes / cron
create index if not exists campagnes_statut_limite_idx
  on public.campagnes (statut, date_limite);

-- Notes d'une campagne
create index if not exists notes_campagne_idx
  on public.notes (campagne_id)
  where campagne_id is not null;
