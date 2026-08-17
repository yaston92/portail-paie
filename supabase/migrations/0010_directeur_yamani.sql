-- Promouvoir le compte fondateur en directeur + membre admin de tous les cabinets
update public.profiles
set role = 'directeur'
where lower(email) = lower('yamaniyassir@gmail.com');

insert into public.cabinet_membres (cabinet_id, profile_id, role_membre)
select c.id, p.id, 'admin'::public.cabinet_role_membre
from public.profiles p
cross join public.cabinets c
where lower(p.email) = lower('yamaniyassir@gmail.com')
  and c.archive = false
on conflict (cabinet_id, profile_id) do update
set role_membre = excluded.role_membre;
