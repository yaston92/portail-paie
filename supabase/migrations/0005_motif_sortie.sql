-- Motif de sortie (déclaré par le client ou le cabinet)
alter table public.salaries
  add column if not exists motif_sortie text;

comment on column public.salaries.motif_sortie is
  'Motif de fin de contrat : licenciement_simple, licenciement_faute_grave, licenciement_faute_lourde, demission, rupture_conventionnelle';
