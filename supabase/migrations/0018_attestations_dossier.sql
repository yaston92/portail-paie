-- Attestations déposées par le cabinet sur un dossier client
create table if not exists public.dossier_attestations (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  type text not null check (type in ('vigilance', 'fiscale', 'probtp', 'cibtp')),
  nom_fichier text not null,
  chemin text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists dossier_attestations_dossier_idx
  on public.dossier_attestations (dossier_id, type, created_at desc);

alter table public.dossier_attestations enable row level security;

drop policy if exists dossier_attestations_select on public.dossier_attestations;
create policy dossier_attestations_select on public.dossier_attestations
  for select using (public.can_read_dossier(dossier_id));

drop policy if exists dossier_attestations_cabinet_write on public.dossier_attestations;
create policy dossier_attestations_cabinet_write on public.dossier_attestations
  for all using (public.cabinet_has_dossier(dossier_id))
  with check (public.cabinet_has_dossier(dossier_id));
