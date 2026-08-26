-- Naprawa jednorazowa dla wdrożonego index.html z koszem i historią.
-- Uruchom CAŁY plik w Supabase: SQL Editor > New query > Run.

alter table public.inspections
  add column if not exists version integer not null default 1;

alter table public.inspections
  add column if not exists deleted_at timestamptz;

create table if not exists public.inspection_audit (
  id bigint generated always as identity primary key,
  inspection_id text not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid
);

create index if not exists inspection_audit_inspection_id_changed_at_idx
  on public.inspection_audit (inspection_id, changed_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end $$;

create or replace function public.audit_inspection_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.inspection_audit (inspection_id, action, new_data, changed_by)
    values (new.id, TG_OP, to_jsonb(new), auth.uid());
    return new;
  elsif TG_OP = 'UPDATE' then
    insert into public.inspection_audit (inspection_id, action, old_data, new_data, changed_by)
    values (new.id, TG_OP, to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  else
    insert into public.inspection_audit (inspection_id, action, old_data, changed_by)
    values (old.id, TG_OP, to_jsonb(old), auth.uid());
    return old;
  end if;
end $$;

drop trigger if exists inspections_set_updated_at on public.inspections;
create trigger inspections_set_updated_at before update on public.inspections
for each row execute function public.set_updated_at();

drop trigger if exists inspections_audit_change on public.inspections;
create trigger inspections_audit_change after insert or update or delete on public.inspections
for each row execute function public.audit_inspection_change();

alter table public.inspection_audit enable row level security;
-- Bezpieczna polityka odczytu historii znajduje się w
-- POLITYKI_BEZPIECZENSTWA.sql. Ten plik nie rozszerza już dostępu do historii.
