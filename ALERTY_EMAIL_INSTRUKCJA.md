# Automatyczne alerty e-mail

Alerty są wysyłane na `weronika.niziolek11@gmail.com` jako jedna zbiorcza wiadomość dziennie.

- od 30 do 15 dni przed utratą ważności: co 5 dni (30, 25, 20, 15 dni);
- od 14 do 0 dni przed utratą ważności: codziennie.

## Jednorazowe wdrożenie

1. W Supabase uruchom plik `ALERTY_EMAIL.sql` w **SQL Editor**.
2. Utwórz konto w [Resend](https://resend.com), zweryfikuj domenę nadawcy i utwórz API key.
3. W Supabase: **Edge Functions > Secrets** dodaj:

   - `RESEND_API_KEY` — klucz z Resend;
   - `ALERT_FROM` — np. `Przeglądy <alerty@twoja-domena.pl>`; adres musi należeć do zweryfikowanej domeny Resend;
   - `ALERT_RECIPIENTS` — `weronika.niziolek11@gmail.com`.

4. Wdróż plik `supabase/functions/send-inspection-alerts/index.ts` jako funkcję Edge Function o nazwie `send-inspection-alerts`.
5. W Supabase Vault utwórz sekrety `inspection_alert_project_url` i `inspection_alert_publishable_key`, korzystając z dwóch poleceń zakomentowanych w `ALERTY_EMAIL.sql`.
6. Odkomentuj i uruchom końcowy blok harmonogramu w `ALERTY_EMAIL.sql`.

Harmonogram działa codziennie o 06:00 UTC. Każda wysyłka jest zapisywana w `inspection_alert_log`, więc ponowne uruchomienie zadania tego samego dnia nie wysyła duplikatów.
