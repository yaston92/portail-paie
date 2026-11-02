-- Même alerte, même statut pour la direction et les collaborateurs.
-- Les notifications déjà présentes reviennent en « pas encore ».

alter table public.notifications
  add column if not exists groupe_id uuid;

create index if not exists notifications_groupe_idx
  on public.notifications (groupe_id);

update public.notifications
set traite = false
where traite = true;
