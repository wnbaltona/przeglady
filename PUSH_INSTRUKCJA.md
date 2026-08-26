# Powiadomienia push — uruchomienie krok po kroku

Powiadomienie jest wysyłane raz dziennie na każde urządzenie, jeżeli co najmniej
jeden przegląd jest po terminie albo straci ważność w ciągu 14 dni. Na ekranie
blokady widoczna jest wyłącznie liczba przeglądów — bez nazw lokali i szczegółów.

## 1. Wygeneruj klucze

Otwórz PowerShell i uruchom:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\wniziolek\Downloads\przeglady-main (2)\przeglady-main\GENERUJ_KLUCZE_PUSH.ps1"
```

Skrypt pokaże trzy wartości:

- `PUBLIC_KEY` — publiczny klucz do aplikacji i Supabase Secrets;
- `PRIVATE_KEY` — tajny klucz wyłącznie do Supabase Secrets;
- `CRON_SECRET` — tajna wartość do Supabase Secrets i Vault.

Nie zapisuj `PRIVATE_KEY` ani `CRON_SECRET` w GitHub, plikach aplikacji lub Excelu.

## 2. Dodaj publiczny klucz do strony

W pliku `supabase-config.js` znajdź:

```javascript
pushVapidPublicKey:''
```

Wklej `PUBLIC_KEY` pomiędzy apostrofy. Publiczny klucz można bezpiecznie
opublikować razem ze stroną.

## 3. Utwórz tabele w Supabase

W Supabase otwórz **SQL Editor > New query**, wklej całą zawartość pliku
`PUSH_NOTIFICATIONS.sql` i wybierz **Run**.

Tabela subskrypcji ma RLS: zalogowany użytkownik może zarządzać wyłącznie swoimi
subskrypcjami. Osoba niezalogowana nie ma dostępu. Log wysyłki jest dostępny
wyłącznie dla funkcji serwerowej.

## 4. Utwórz funkcję Edge Function

1. Wejdź w **Edge Functions**.
2. Utwórz funkcję o dokładnej nazwie `send-inspection-push`.
3. Wklej kod z `supabase/functions/send-inspection-push/index.ts`.
4. Pozostaw włączone sprawdzanie JWT i wdroż funkcję.

W **Edge Functions > Secrets** dodaj:

| Nazwa | Wartość |
|---|---|
| `VAPID_PUBLIC_KEY` | `PUBLIC_KEY` z generatora |
| `VAPID_PRIVATE_KEY` | `PRIVATE_KEY` z generatora |
| `PUSH_CRON_SECRET` | `CRON_SECRET` z generatora |
| `VAPID_SUBJECT` | `https://wnbaltona.github.io/` |

`SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` są udostępniane funkcji przez
Supabase automatycznie. Nie wpisuj klucza `service_role` do strony ani GitHub.

## 5. Dodaj harmonogram

Otwórz `PUSH_HARMONOGRAM.sql` i zamień:

- `WPISZ_PROJECT_URL` na adres projektu Supabase;
- `WPISZ_PUBLISHABLE_KEY` na klucz anon/publishable z **Settings > API**;
- `WPISZ_CRON_SECRET` na tę samą wartość `CRON_SECRET`, którą dodano do Secrets.

Następnie uruchom cały plik w SQL Editorze. Skrypt włączy `pg_cron` i `pg_net`
oraz utworzy codzienny harmonogram na 07:00 UTC.

## 6. Opublikuj stronę

Prześlij na GitHub Pages co najmniej zaktualizowane pliki:

- `index.html`;
- `service-worker.js`;
- `supabase-config.js`;
- `manifest.webmanifest` i folder `icons` — jeśli nie są jeszcze opublikowane.

Po wdrożeniu odśwież stronę. Aktualizacja Service Workera czasem wymaga zamknięcia
i ponownego uruchomienia zainstalowanej aplikacji.

## 7. Włącz powiadomienia na telefonie

### Android

Zaloguj się, otwórz **Menu > Włącz powiadomienia** i zaakceptuj pytanie systemu.

### iPhone lub iPad

Najpierw wybierz w przeglądarce **Udostępnij > Do ekranu początkowego**. Otwórz
aplikację z nowej ikony, zaloguj się i wybierz **Menu > Włącz powiadomienia**.

Po poprawnym włączeniu telefon od razu pokaże lokalne powiadomienie testowe.

## 8. Sprawdź wysyłkę z Supabase

Uruchom plik `PUSH_TEST.sql` w SQL Editorze. Telefon powinien otrzymać
powiadomienie „Test powiadomień”. Wynik sprawdzisz także w
**Edge Functions > send-inspection-push > Logs**.

## Wyłączenie powiadomień

Na danym telefonie wybierz **Menu > Wyłącz powiadomienia**. Aplikacja usuwa
subskrypcję urządzenia z Supabase i wyłącza ją w przeglądarce.
