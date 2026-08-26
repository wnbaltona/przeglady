-- POWIADOMIENIA PUSH — CODZIENNY HARMONOGRAM
--
-- Przed uruchomieniem zamień trzy wartości oznaczone WPISZ_...:
--   WPISZ_PROJECT_URL       np. https://abcdefgh.supabase.co
--   WPISZ_PUBLISHABLE_KEY   klucz anon/publishable z Settings > API
--   WPISZ_CRON_SECRET       wartość CRON_SECRET z GENERUJ_KLUCZE_PUSH.ps1

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://bsisclhysmvzqgggnpna.supabase.co/rest/v1/', 'push_project_url');
select vault.create_secret('sb_publishable_v_o5EHrYB43tIKEhBG7Kdg_erymhXpM', 'push_publishable_key');
select vault.create_secret('_mJP7VvK-3PI58FjCMN1viaVzD0yXeNkd8dVWxvwd4U', 'push_cron_secret');

select cron.unschedule(jobid)
from cron.job
where jobname = 'daily-inspection-push';

select cron.schedule(
  'daily-inspection-push',
  '0 7 * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_project_url') || '/functions/v1/send-inspection-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'push_publishable_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);

-- Harmonogram uruchamia się codziennie o 07:00 UTC.
-- Duplikaty są blokowane przez tabelę push_notification_log.
