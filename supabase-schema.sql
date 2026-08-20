-- Uruchom ten skrypt w Supabase: SQL Editor > New query.
-- Dostęp do danych ma wyłącznie osoba zalogowana w projekcie Supabase.
create table if not exists public.inspections (
  id text primary key,
  city text not null default '',
  local text not null default '',
  type text not null default '',
  done date,
  months integer not null default 12,
  protocol_date date,
  protocol_file_name text,
  protocol_path text,
  notes text not null default '',
  source_id text unique,
  version integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Słownik rodzajów przeglądów, niezależny od podziału w Excelu na grupy.
create table if not exists public.inspection_types (
  name text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.inspection_types add column if not exists active boolean not null default true;

create table if not exists public.locations (
  city text not null,
  local text not null,
  created_at timestamptz not null default now(),
  primary key (city, local)
);

alter table public.inspections add column if not exists protocol_path text;
alter table public.inspections add column if not exists created_at timestamptz not null default now();
alter table public.inspections add column if not exists source_id text;
alter table public.inspections add column if not exists version integer not null default 1;
alter table public.inspections add column if not exists deleted_at timestamptz;
do $$ begin
  alter table public.inspections add constraint inspections_source_id_key unique (source_id);
exception when duplicate_object then null;
end $$;

-- Zapobiega ponownemu załadowaniu danych startowych po celowym usunięciu wszystkich wpisów.
create table if not exists public.app_state (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- Pełna historia wpisów, także dla pozycji przeniesionych do kosza.
create table if not exists public.inspection_audit (
  id bigint generated always as identity primary key,
  inspection_id text not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid
);
create index if not exists inspection_audit_inspection_id_changed_at_idx on public.inspection_audit (inspection_id, changed_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); new.version = old.version + 1; return new; end $$;

create or replace function public.audit_inspection_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.inspection_audit (inspection_id, action, new_data, changed_by) values (new.id, TG_OP, to_jsonb(new), auth.uid());
    return new;
  elsif TG_OP = 'UPDATE' then
    insert into public.inspection_audit (inspection_id, action, old_data, new_data, changed_by) values (new.id, TG_OP, to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  else
    insert into public.inspection_audit (inspection_id, action, old_data, changed_by) values (old.id, TG_OP, to_jsonb(old), auth.uid());
    return old;
  end if;
end $$;

drop trigger if exists inspections_set_updated_at on public.inspections;
create trigger inspections_set_updated_at before update on public.inspections
for each row execute function public.set_updated_at();
drop trigger if exists inspections_audit_change on public.inspections;
create trigger inspections_audit_change after insert or update or delete on public.inspections
for each row execute function public.audit_inspection_change();

alter table public.inspections enable row level security;
alter table public.inspection_types enable row level security;
alter table public.locations enable row level security;
alter table public.app_state enable row level security;
alter table public.inspection_audit enable row level security;

drop policy if exists "Zalogowani odczytują przeglądy" on public.inspections;
drop policy if exists "Zalogowani dodają przeglądy" on public.inspections;
drop policy if exists "Zalogowani edytują przeglądy" on public.inspections;
drop policy if exists "Zalogowani usuwają przeglądy" on public.inspections;
create policy "Zalogowani odczytują przeglądy" on public.inspections for select to authenticated using (true);
create policy "Zalogowani dodają przeglądy" on public.inspections for insert to authenticated with check (true);
create policy "Zalogowani edytują przeglądy" on public.inspections for update to authenticated using (true) with check (true);
create policy "Zalogowani usuwają przeglądy" on public.inspections for delete to authenticated using (true);

drop policy if exists "Zalogowani odczytują rodzaje przeglądów" on public.inspection_types;
drop policy if exists "Zalogowani dodają rodzaje przeglądów" on public.inspection_types;
drop policy if exists "Zalogowani edytują rodzaje przeglądów" on public.inspection_types;
create policy "Zalogowani odczytują rodzaje przeglądów" on public.inspection_types for select to authenticated using (true);
create policy "Zalogowani dodają rodzaje przeglądów" on public.inspection_types for insert to authenticated with check (true);
create policy "Zalogowani edytują rodzaje przeglądów" on public.inspection_types for update to authenticated using (true) with check (true);

drop policy if exists "Zalogowani odczytują lokale" on public.locations;
drop policy if exists "Zalogowani dodają lokale" on public.locations;
drop policy if exists "Zalogowani edytują lokale" on public.locations;
drop policy if exists "Zalogowani usuwają lokale" on public.locations;
create policy "Zalogowani odczytują lokale" on public.locations for select to authenticated using (true);
create policy "Zalogowani dodają lokale" on public.locations for insert to authenticated with check (true);
create policy "Zalogowani edytują lokale" on public.locations for update to authenticated using (true) with check (true);
create policy "Zalogowani usuwają lokale" on public.locations for delete to authenticated using (true);

drop policy if exists "Zalogowani odczytują stan aplikacji" on public.app_state;
drop policy if exists "Zalogowani zapisują stan aplikacji" on public.app_state;
drop policy if exists "Zalogowani aktualizują stan aplikacji" on public.app_state;
create policy "Zalogowani odczytują stan aplikacji" on public.app_state for select to authenticated using (true);
create policy "Zalogowani zapisują stan aplikacji" on public.app_state for insert to authenticated with check (true);
create policy "Zalogowani aktualizują stan aplikacji" on public.app_state for update to authenticated using (true) with check (true);

drop policy if exists "Zalogowani odczytują historię przeglądów" on public.inspection_audit;
create policy "Zalogowani odczytują historię przeglądów" on public.inspection_audit for select to authenticated using (true);

do $$ begin alter publication supabase_realtime add table public.inspections; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.inspection_types; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.locations; exception when duplicate_object then null; end $$;

-- Załączniki protokołów: prywatny bucket, dostępny tylko po zalogowaniu.
insert into storage.buckets (id, name, public) values ('protocols', 'protocols', false) on conflict (id) do nothing;
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
where id = 'protocols';
drop policy if exists "Zalogowani odczytują protokoły" on storage.objects;
drop policy if exists "Zalogowani dodają protokoły" on storage.objects;
drop policy if exists "Zalogowani aktualizują protokoły" on storage.objects;
drop policy if exists "Zalogowani usuwają protokoły" on storage.objects;
create policy "Zalogowani odczytują protokoły" on storage.objects for select to authenticated using (bucket_id = 'protocols');
create policy "Zalogowani dodają protokoły" on storage.objects for insert to authenticated with check (bucket_id = 'protocols');
create policy "Zalogowani aktualizują protokoły" on storage.objects for update to authenticated using (bucket_id = 'protocols');
create policy "Zalogowani usuwają protokoły" on storage.objects for delete to authenticated using (bucket_id = 'protocols');
