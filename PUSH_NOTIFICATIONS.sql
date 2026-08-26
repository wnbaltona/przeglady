-- POWIADOMIENIA PUSH — TABELE I POLITYKI RLS
-- Uruchom CAŁY plik w Supabase: SQL Editor > New query > Run.

begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 20 and 4096),
  p256dh text not null check (char_length(p256dh) between 20 and 512),
  auth text not null check (char_length(auth) between 8 and 256),
  user_agent text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_enabled_idx
  on public.push_subscriptions (enabled)
  where enabled = true;

create table if not exists public.push_notification_log (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  alert_date date not null,
  created_at timestamptz not null default now(),
  unique (subscription_id, alert_date)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_notification_log enable row level security;

drop policy if exists "Użytkownicy odczytują własne subskrypcje" on public.push_subscriptions;
drop policy if exists "Użytkownicy dodają własne subskrypcje" on public.push_subscriptions;
drop policy if exists "Użytkownicy aktualizują własne subskrypcje" on public.push_subscriptions;
drop policy if exists "Użytkownicy usuwają własne subskrypcje" on public.push_subscriptions;

create policy "Użytkownicy odczytują własne subskrypcje"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Użytkownicy dodają własne subskrypcje"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Użytkownicy aktualizują własne subskrypcje"
  on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Użytkownicy usuwają własne subskrypcje"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Log jest dostępny wyłącznie dla funkcji serwerowej z kluczem service_role.
-- Nie tworzymy dla niego żadnej polityki dostępu z przeglądarki.
revoke all on table public.push_subscriptions from anon;
revoke all on table public.push_notification_log from anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

commit;
