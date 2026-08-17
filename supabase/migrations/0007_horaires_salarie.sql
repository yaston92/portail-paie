-- Horaires hebdomadaires par salarié (heures / jour)
-- Format JSON : { "lun": 7, "mar": 7, "mer": 7, "jeu": 7, "ven": 7, "sam": 0, "dim": 0 }
alter table public.salaries
  add column if not exists horaires jsonb;

comment on column public.salaries.horaires is
  'Heures de travail par jour de semaine (lun–dim). Null = défaut depuis duree_hebdo / 5.';
