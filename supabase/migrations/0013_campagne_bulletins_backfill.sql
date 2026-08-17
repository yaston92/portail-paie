-- Backfill : campagnes dont les bulletins du mois sont déjà publiés
update public.campagnes c
set statut = 'bulletins_envoyes'
where c.statut in ('envoyee', 'cloturee_identique')
  and exists (
    select 1
    from public.bulletin_uploads u
    where u.dossier_id = c.dossier_id
      and u.mois = c.mois
      and u.statut = 'publie'
  );
