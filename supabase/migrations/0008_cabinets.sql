-- ============================================================
-- 0008 : ajouter UNIQUEMENT la valeur d'enum `directeur`
-- Doit être exécuté et COMMITÉ avant 0009 (contrainte Postgres).
-- ============================================================

do $$ begin
  alter type public.user_role add value if not exists 'directeur';
exception
  when duplicate_object then null;
  when others then
    begin
      alter type public.user_role add value 'directeur';
    exception when duplicate_object then null;
    end;
end $$;
