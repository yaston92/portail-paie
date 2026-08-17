-- Arrêts maladie déclarés par le salarié ou le client
create table if not exists public.arrets_maladie (
  id uuid primary key default gen_random_uuid(),
  salarie_id uuid not null references public.salaries (id) on delete cascade,
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  declarant_id uuid not null references public.profiles (id),
  date_debut date not null,
  date_fin date not null,
  jours numeric(5, 2) not null,
  justificatif_chemin text,
  justificatif_nom text,
  pending_sync jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint arrets_maladie_dates check (date_fin >= date_debut),
  constraint arrets_maladie_jours check (jours > 0)
);

create index if not exists arrets_maladie_salarie_idx
  on public.arrets_maladie (salarie_id, created_at desc);
create index if not exists arrets_maladie_dossier_idx
  on public.arrets_maladie (dossier_id, created_at desc);

alter table public.arrets_maladie enable row level security;

drop policy if exists arrets_maladie_select on public.arrets_maladie;
create policy arrets_maladie_select on public.arrets_maladie
  for select using (
    public.cabinet_has_dossier(dossier_id)
    or (public.app_role() = 'client' and dossier_id = public.app_dossier_id())
    or (public.app_role() = 'salarie' and salarie_id = public.app_salarie_id())
  );

drop policy if exists arrets_maladie_insert on public.arrets_maladie;
create policy arrets_maladie_insert on public.arrets_maladie
  for insert with check (
    (
      public.app_role() = 'client'
      and dossier_id = public.app_dossier_id()
      and declarant_id = auth.uid()
    )
    or (
      public.app_role() = 'salarie'
      and salarie_id = public.app_salarie_id()
      and declarant_id = auth.uid()
    )
    or public.cabinet_has_dossier(dossier_id)
  );

insert into public.retention_settings (type_document, duree_mois, description)
values (
  'arret_maladie',
  36,
  'Justificatifs d''arrêts maladie'
)
on conflict (type_document) do nothing;
