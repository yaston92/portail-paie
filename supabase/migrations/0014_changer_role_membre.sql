-- RPC : changement de rôle membre (app mobile sans API Next)
create or replace function public.changer_role_membre(
  p_cabinet_id uuid,
  p_profile_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acteur uuid := auth.uid();
  v_acteur_role public.user_role;
  v_acteur_admin boolean;
  v_cible_role public.user_role;
  v_cible_membre public.cabinet_role_membre;
  v_actuel text;
  v_nouveau text := p_role;
  v_role_membre public.cabinet_role_membre;
  v_role_profil public.user_role;
begin
  if v_acteur is null then
    raise exception 'Non autorisé';
  end if;

  if p_role not in ('directeur', 'admin_cabinet', 'collaborateur') then
    raise exception 'Rôle invalide';
  end if;

  if p_profile_id = v_acteur then
    raise exception 'Vous ne pouvez pas modifier votre propre rôle';
  end if;

  select role into v_acteur_role from public.profiles where id = v_acteur;
  if v_acteur_role is null then
    raise exception 'Non autorisé';
  end if;

  v_acteur_admin :=
    v_acteur_role = 'directeur'
    or public.peut_admin_cabinet(p_cabinet_id);

  if not v_acteur_admin then
    raise exception 'Réservé à l''administrateur du cabinet';
  end if;

  if not exists (
    select 1 from public.cabinet_membres
    where cabinet_id = p_cabinet_id and profile_id = p_profile_id
  ) then
    raise exception 'Ce membre n''appartient pas à ce cabinet';
  end if;

  select p.role, m.role_membre
    into v_cible_role, v_cible_membre
  from public.cabinet_membres m
  join public.profiles p on p.id = m.profile_id
  where m.cabinet_id = p_cabinet_id and m.profile_id = p_profile_id;

  if v_cible_role = 'directeur' then
    v_actuel := 'directeur';
  elsif v_cible_membre = 'admin' or v_cible_role = 'admin_cabinet' then
    v_actuel := 'admin_cabinet';
  else
    v_actuel := 'collaborateur';
  end if;

  if v_acteur_role <> 'directeur' then
    if v_actuel <> 'collaborateur' then
      raise exception 'Un administrateur ne peut modifier que les collaborateurs';
    end if;
    if v_nouveau = 'directeur' then
      raise exception 'Seul un directeur peut nommer un directeur';
    end if;
  end if;

  if v_actuel = v_nouveau then
    return jsonb_build_object('ok', true, 'inchange', true, 'role', v_nouveau);
  end if;

  if v_nouveau = 'collaborateur' then
    v_role_membre := 'collaborateur';
    v_role_profil := 'collaborateur';
  elsif v_nouveau = 'admin_cabinet' then
    v_role_membre := 'admin';
    v_role_profil := 'admin_cabinet';
  else
    v_role_membre := 'admin';
    v_role_profil := 'directeur';
  end if;

  update public.profiles
  set role = v_role_profil
  where id = p_profile_id;

  update public.cabinet_membres
  set role_membre = v_role_membre
  where cabinet_id = p_cabinet_id and profile_id = p_profile_id;

  return jsonb_build_object('ok', true, 'role', v_nouveau);
end;
$$;

revoke all on function public.changer_role_membre(uuid, uuid, text) from public;
grant execute on function public.changer_role_membre(uuid, uuid, text) to authenticated;
