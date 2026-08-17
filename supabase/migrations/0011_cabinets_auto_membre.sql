-- Auto-adhésion du créateur après insert cabinet
-- (sinon INSERT … RETURNING échoue : SELECT exige est_membre_cabinet)

create or replace function public.cabinets_auto_membre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into public.cabinet_membres (cabinet_id, profile_id, role_membre)
    values (new.id, auth.uid(), 'admin')
    on conflict (cabinet_id, profile_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists cabinets_auto_membre on public.cabinets;
create trigger cabinets_auto_membre
  after insert on public.cabinets
  for each row
  execute function public.cabinets_auto_membre();
