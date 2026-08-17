-- Nouveau statut campagne : bulletins envoyés au client
-- Exécuter et COMMITTER avant 0013.
do $$ begin
  alter type public.campagne_statut add value if not exists 'bulletins_envoyes';
exception
  when duplicate_object then null;
  when others then
    begin
      alter type public.campagne_statut add value 'bulletins_envoyes';
    exception when duplicate_object then null;
    end;
end $$;
