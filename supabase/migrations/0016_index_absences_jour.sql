-- Planning : absences d'un dossier pour un jour donné
create index if not exists absences_dossier_jour_idx
  on public.absences (dossier_id, jour);
