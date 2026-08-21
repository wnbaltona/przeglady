-- ALERTY E-MAIL DLA PRZEGLĄDÓW
-- Uruchom cały plik w Supabase: SQL Editor > New query > Run.

create table if not exists public.inspection_alert_log (
  id bigint generated always as identity primary key,
  inspection_id text not null references public.inspections(id) on delete cascade,
  alert_kind text not null check (alert_kind in ('daily', 'five_day')),
  alert_date date not null,
  expires_on date not null,
  recipients text not null,
  created_at timestamptz not null default now(),
  unique (inspection_id, alert_kind, alert_date)
);

alter table public.inspection_alert_log enable row level security;
drop policy if exists "Administratorzy odczytują log alertów" on public.inspection_alert_log;
create policy "Administratorzy odczytują log alertów"
  on public.inspection_alert_log for select to authenticated using (true);

-- Harmonogram uruchamia funkcję codziennie o 06:00 UTC (07:00 zimą / 08:00 latem w Polsce).
-- Najpierw w Vault utwórz dwa sekrety, zastępując wartości własnymi danymi projektu:
-- select vault.create_secret('https://TWOJ-PROJEKT.supabase.co', 'inspection_alert_project_url');
-- select vault.create_secret('TWOJ_PUBLISHABLE_KEY', 'inspection_alert_publishable_key');

-- Wykonaj poniższe dopiero po utworzeniu sekretów oraz wdrożeniu funkcji send-inspection-alerts.
-- select cron.unschedule(jobid) from cron.job where jobname = 'daily-inspection-email-alerts';
-- select cron.schedule(
--   'daily-inspection-email-alerts',
--   '0 6 * * *',
--   $$
--     select net.http_post(
--       url := (select decrypted_secret from vault.decrypted_secrets where name = 'inspection_alert_project_url') || '/functions/v1/send-inspection-alerts',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'inspection_alert_publishable_key')
--       ),
--       body := '{}'::jsonb,
--       timeout_milliseconds := 10000
--     );
--   $$
-- );
