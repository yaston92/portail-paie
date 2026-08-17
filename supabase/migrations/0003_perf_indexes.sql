-- Index pour accélérer les pages salarié / campagnes / ZIP

-- Accueil salarié + API solde : dernier bulletin par salarié
create index if not exists bulletins_salarie_mois_idx
  on public.bulletins (salarie_id, mois desc);

-- Ouverture campagne / sync CP : lookup campagne du mois pour un dossier
create index if not exists campagnes_dossier_mois_idx
  on public.campagnes (dossier_id, mois);

-- Absences par saisie (calendrier variables)
create index if not exists absences_saisie_idx
  on public.absences (saisie_id);
