-- POLITYKI BEZPIECZENSTWA DLA APLIKACJI „PRZEGLĄDY” — BEZ RÓL
-- Uruchom CAŁY plik w Supabase: SQL Editor > New query > Run.
--
-- Zasada dostępu:
--   * osoba niezalogowana nie ma dostępu do danych ani załączników;
--   * każdy zalogowany użytkownik Supabase może korzystać ze wszystkich
--     funkcji aplikacji, w tym dodawać, edytować i usuwać wpisy;
--   * bucket „protocols” pozostaje prywatny.
--
-- WAŻNE: w Supabase wyłącz publiczne zakładanie kont. Konta pracowników
-- twórz lub zapraszaj wyłącznie w Authentication > Users.

begin;

alter table public.inspections enable row level security;
alter table public.inspection_types enable row level security;
alter table public.locations enable row level security;
alter table public.app_state enable row level security;
alter table public.inspection_audit enable row level security;

-- Usuń wszystkie wcześniejsze polityki tych tabel. Dzięki temu żadna stara
-- reguła nie pozostawi przypadkowo dostępu dla roli anon.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'inspections',
        'inspection_types',
        'locations',
        'app_state',
        'inspection_audit'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

-- Przeglądy.
create policy "Zalogowani odczytują przeglądy"
  on public.inspections for select to authenticated
  using ((select auth.uid()) is not null);

create policy "Zalogowani dodają przeglądy"
  on public.inspections for insert to authenticated
  with check ((select auth.uid()) is not null);

create policy "Zalogowani aktualizują przeglądy"
  on public.inspections for update to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

create policy "Zalogowani usuwają przeglądy"
  on public.inspections for delete to authenticated
  using ((select auth.uid()) is not null);

-- Rodzaje przeglądów.
create policy "Zalogowani odczytują rodzaje"
  on public.inspection_types for select to authenticated
  using ((select auth.uid()) is not null);

create policy "Zalogowani dodają rodzaje"
  on public.inspection_types for insert to authenticated
  with check ((select auth.uid()) is not null);

create policy "Zalogowani aktualizują rodzaje"
  on public.inspection_types for update to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

create policy "Zalogowani usuwają rodzaje"
  on public.inspection_types for delete to authenticated
  using ((select auth.uid()) is not null);

-- Lokale.
create policy "Zalogowani odczytują lokale"
  on public.locations for select to authenticated
  using ((select auth.uid()) is not null);

create policy "Zalogowani dodają lokale"
  on public.locations for insert to authenticated
  with check ((select auth.uid()) is not null);

create policy "Zalogowani aktualizują lokale"
  on public.locations for update to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

create policy "Zalogowani usuwają lokale"
  on public.locations for delete to authenticated
  using ((select auth.uid()) is not null);

-- Stan inicjalizacji aplikacji.
create policy "Zalogowani odczytują stan aplikacji"
  on public.app_state for select to authenticated
  using ((select auth.uid()) is not null);

create policy "Zalogowani dodają stan aplikacji"
  on public.app_state for insert to authenticated
  with check ((select auth.uid()) is not null);

create policy "Zalogowani aktualizują stan aplikacji"
  on public.app_state for update to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

-- Historia jest tylko do odczytu z przeglądarki. Wpisy tworzy trigger bazy.
create policy "Zalogowani odczytują historię"
  on public.inspection_audit for select to authenticated
  using ((select auth.uid()) is not null);

-- Prywatny bucket protokołów.
insert into storage.buckets (id, name, public)
values ('protocols', 'protocols', false)
on conflict (id) do update set public = false;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
where id = 'protocols';

drop policy if exists "Zalogowani odczytują protokoły" on storage.objects;
drop policy if exists "Zalogowani dodają protokoły" on storage.objects;
drop policy if exists "Zalogowani aktualizują protokoły" on storage.objects;
drop policy if exists "Zalogowani usuwają protokoły" on storage.objects;
drop policy if exists "Członkowie odczytują protokoły" on storage.objects;
drop policy if exists "Edytorzy dodają protokoły" on storage.objects;
drop policy if exists "Edytorzy aktualizują protokoły" on storage.objects;
drop policy if exists "Edytorzy usuwają protokoły" on storage.objects;

create policy "Zalogowani odczytują protokoły"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'protocols'
    and (select auth.uid()) is not null
  );

create policy "Zalogowani dodają protokoły"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'protocols'
    and (select auth.uid()) is not null
  );

create policy "Zalogowani aktualizują protokoły"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'protocols'
    and (select auth.uid()) is not null
  )
  with check (
    bucket_id = 'protocols'
    and (select auth.uid()) is not null
  );

create policy "Zalogowani usuwają protokoły"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'protocols'
    and (select auth.uid()) is not null
  );

-- Jawnie odbierz kluczowi anon uprawnienia do tabel biznesowych.
revoke all on table public.inspections from anon;
revoke all on table public.inspection_types from anon;
revoke all on table public.locations from anon;
revoke all on table public.app_state from anon;
revoke all on table public.inspection_audit from anon;

-- Zalogowany użytkownik otrzymuje wyłącznie uprawnienia potrzebne aplikacji.
grant select, insert, update, delete on table public.inspections to authenticated;
grant select, insert, update, delete on table public.inspection_types to authenticated;
grant select, insert, update, delete on table public.locations to authenticated;
grant select, insert, update on table public.app_state to authenticated;
grant select on table public.inspection_audit to authenticated;

commit;
