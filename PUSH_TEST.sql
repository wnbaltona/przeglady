-- TEST SERWEROWEGO POWIADOMIENIA PUSH
-- Uruchom po wykonaniu wszystkich kroków z PUSH_INSTRUKCJA.md i po włączeniu
-- powiadomień na co najmniej jednym telefonie.

select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_project_url') || '/functions/v1/send-inspection-push',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'push_publishable_key'),
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
  ),
  body := '{"test":true}'::jsonb,
  timeout_milliseconds := 30000
) as request_id;

-- Wyniki działania funkcji sprawdzisz w Supabase:
-- Edge Functions > send-inspection-push > Logs.
