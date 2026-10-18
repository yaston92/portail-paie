-- Droits d'action des collaborateurs, réglés par le directeur.
-- Directeur et administrateur ne sont pas limités par cette colonne.

alter table public.cabinet_membres
  add column if not exists droits jsonb not null default '{
    "salaries": true,
    "embauches": true,
    "bulletins": true,
    "variables": true,
    "absences": true
  }'::jsonb;

comment on column public.cabinet_membres.droits is
  'Droits du collaborateur : salaries, embauches, bulletins, variables, absences. false retire l''action.';

create or replace function public.collaborateur_peut(cid uuid, cle text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_role() is distinct from 'collaborateur'
    or exists (
      select 1
      from public.cabinet_membres m
      where m.cabinet_id = cid
        and m.profile_id = auth.uid()
        and (
          m.role_membre = 'admin'
          or coalesce((m.droits ->> cle)::boolean, true)
        )
    );
$$;

grant execute on function public.collaborateur_peut(uuid, text) to authenticated;

-- Le découpage des bulletins s'enregistre avec la session du collaborateur.
drop policy if exists bulletin_segments_cabinet on public.bulletin_segments;
drop policy if exists bulletin_segments_cabinet_select on public.bulletin_segments;
drop policy if exists bulletin_segments_cabinet_write on public.bulletin_segments;

create policy bulletin_segments_cabinet_select on public.bulletin_segments
  for select using (
    exists (
      select 1 from public.bulletin_uploads u
      where u.id = upload_id and public.cabinet_has_dossier(u.dossier_id)
    )
  );

create policy bulletin_segments_cabinet_write on public.bulletin_segments
  for insert with check (
    exists (
      select 1
      from public.bulletin_uploads u
      join public.dossiers d on d.id = u.dossier_id
      where u.id = upload_id
        and public.cabinet_has_dossier(u.dossier_id)
        and public.collaborateur_peut(d.cabinet_id, 'bulletins')
    )
  );

create policy bulletin_segments_cabinet_update on public.bulletin_segments
  for update using (
    exists (
      select 1
      from public.bulletin_uploads u
      join public.dossiers d on d.id = u.dossier_id
      where u.id = upload_id
        and public.cabinet_has_dossier(u.dossier_id)
        and public.collaborateur_peut(d.cabinet_id, 'bulletins')
    )
  ) with check (
    exists (
      select 1
      from public.bulletin_uploads u
      join public.dossiers d on d.id = u.dossier_id
      where u.id = upload_id
        and public.cabinet_has_dossier(u.dossier_id)
        and public.collaborateur_peut(d.cabinet_id, 'bulletins')
    )
  );

create policy bulletin_segments_cabinet_delete on public.bulletin_segments
  for delete using (
    exists (
      select 1
      from public.bulletin_uploads u
      join public.dossiers d on d.id = u.dossier_id
      where u.id = upload_id
        and public.cabinet_has_dossier(u.dossier_id)
        and public.collaborateur_peut(d.cabinet_id, 'bulletins')
    )
  );

drop policy if exists soldes_cabinet_write on public.soldes_cp;

create policy soldes_cabinet_insert on public.soldes_cp
  for insert with check (
    public.cabinet_has_dossier(dossier_id)
    and exists (
      select 1 from public.dossiers d
      where d.id = dossier_id
        and public.collaborateur_peut(d.cabinet_id, 'salaries')
    )
  );

create policy soldes_cabinet_update on public.soldes_cp
  for update using (
    public.cabinet_has_dossier(dossier_id)
    and exists (
      select 1 from public.dossiers d
      where d.id = dossier_id
        and public.collaborateur_peut(d.cabinet_id, 'salaries')
    )
  ) with check (
    public.cabinet_has_dossier(dossier_id)
    and exists (
      select 1 from public.dossiers d
      where d.id = dossier_id
        and public.collaborateur_peut(d.cabinet_id, 'salaries')
    )
  );

create policy soldes_cabinet_delete on public.soldes_cp
  for delete using (
    public.cabinet_has_dossier(dossier_id)
    and exists (
      select 1 from public.dossiers d
      where d.id = dossier_id
        and public.collaborateur_peut(d.cabinet_id, 'salaries')
    )
  );
