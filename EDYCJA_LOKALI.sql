-- Uruchom jednorazowo w Supabase > SQL Editor przed korzystaniem z edycji lokali.
-- Cała zmiana jest jedną transakcją: błąd wycofuje wszystkie aktualizacje.
create or replace function public.rename_location(
  p_old_city text,
  p_old_local text,
  p_new_city text,
  p_new_local text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed_count integer;
begin
  if auth.uid() is null then
    raise exception 'Wymagane zalogowanie.';
  end if;
  if nullif(trim(p_new_city), '') is null or nullif(trim(p_new_local), '') is null then
    raise exception 'Miasto i nazwa obiektu nie mogą być puste.';
  end if;

  perform 1 from public.locations
  where city = p_old_city and local = p_old_local
  for update;
  if not found then
    raise exception 'Obiekt został zmieniony lub usunięty. Odśwież listę i spróbuj ponownie.';
  end if;

  if p_old_city = trim(p_new_city) and p_old_local = trim(p_new_local) then
    return;
  end if;

  update public.locations
  set city = trim(p_new_city), local = trim(p_new_local)
  where city = p_old_city and local = p_old_local;
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'Nie udało się zmienić obiektu. Sprawdź uprawnienia.';
  end if;

  -- Obejmuje również kosz, żeby przywrócony przegląd używał aktualnej nazwy.
  -- Historia zmian i załączniki pozostają zachowane.
  update public.inspections
  set city = trim(p_new_city), local = trim(p_new_local)
  where city = p_old_city and local = p_old_local;
end;
$$;

revoke all on function public.rename_location(text, text, text, text) from public, anon;
grant execute on function public.rename_location(text, text, text, text) to authenticated;
