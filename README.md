# Rejestr Przeglądów

Aplikacja do obsługi terminów przeglądów, protokołów i powiadomień. Dane i konta użytkowników są przechowywane w Supabase.

## Struktura kodu

- `index.html` — widoki, formularze i kolejność wczytywania skryptów.
- `styles.css` — wspólne style, motywy i układy responsywne.
- `inspection-utils.js` — obliczanie terminów, statusów i etykiet.
- `calendar.js` — siatka miesiąca, alerty i szczegóły terminów.
- `app.js` — stan aplikacji, Supabase, rejestr i operacje użytkownika.
- `workspace.js` — nawigacja, pulpit i szczegóły przeglądu.
- `header-session.js` — przycisk wylogowania w nagłówku.
- `ux.js` — fokus w oknach, informacje przy formularzach i stan połączenia.
- `mobile-history.js` — zamykanie okien i cofanie na telefonie.
- `install.js` — przycisk instalacji i instrukcje dla przeglądarek.
- `service-worker.js`, `manifest.webmanifest`, `icons/` — instalacja PWA i powiadomienia push.
- `supabase/` — funkcje serwerowe powiadomień.
- `tests/inspection-utils.test.cjs` — testy dat i statusów.

Skrypty są wczytywane jako zwykłe skrypty przeglądarki, bez procesu budowania. Funkcje pomocnicze i kalendarz muszą być wczytane przed `app.js`; zachowaj kolejność z `index.html`. Reguły responsywne w arkuszu korzystają z kaskady CSS, więc przy przenoszeniu reguł uwzględnij ich kolejność i warunki `@media`.

## Publikacja

Opublikuj `index.html`, wszystkie główne pliki `.js`, `styles.css`, `manifest.webmanifest` i katalog `icons/` na serwerze statycznym z HTTPS. Konfiguracja projektu jest w `supabase-config.js`. Nie publikuj klucza `service_role`.

Aplikacja pobiera dane z Supabase i wymaga internetu. Service worker nie zapisuje lokalnej kopii rejestru. Arkusze, testy, skrypty synchronizacji oraz SQL nie są potrzebne do działania strony.

## Obsługa

Na komputerze aplikacja ma boczną nawigację, a na telefonie pasek dolny. Rejestr grupuje przeglądy według miast i lokali. Kafelki statusów filtrują wpisy: Po terminie, Do wykonania, Aktualne i Wszystkie wpisy. Alerty otwiera dzwonek w nagłówku. Lokale można wyszukiwać i edytować. Przycisk Moje konto w nagłówku pokazuje dane sesji i pozwala się wylogować. Po wylogowaniu rejestr jest ukryty, dane widoku wyczyszczone, a ekran logowania wyświetla się na białym tle.

Filtry i rozwinięcia są zapamiętywane w sesji przeglądarki osobno dla każdego konta. Przycisk Wstecz na telefonie najpierw zamyka otwarte okno. Przycisk instalacji w panelu logowania korzysta z systemowego okna, gdy przeglądarka je udostępnia; inaczej pokazuje instrukcję. Na iPhonie użyj w Safari: Udostępnij → Do ekranu początkowego.

## Baza i synchronizacja

Przed pierwszą edycją lokali uruchom `EDYCJA_LOKALI.sql` w Supabase SQL Editor. Zmiana nazwy lub miasta aktualizuje słownik i powiązane przeglądy w jednej transakcji. Skrypt nie jest wykonywany automatycznie.

`supabase-schema.sql` opisuje schemat. Pozostałe pliki SQL zawierają konfigurację uprawnień, powiadomień i naprawy danych. Przed ich wykonaniem sprawdź stan docelowej bazy. Konfigurację push opisuje `PUSH_INSTRUKCJA.md`.

Import z Excela: `sync_excel_to_supabase.py`, zależności w `requirements.txt`. Eksport do wskazanego arkusza: `sync_supabase_to_excel.ps1`, wymaga Microsoft Excel. Oba skrypty używają zmiennych środowiskowych `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY`. Arkusze `.xlsx` pozostają materiałami do synchronizacji.

## Testy

Uruchom z katalogu projektu:

```sh
node tests/inspection-utils.test.cjs
```

Testy sprawdzają końce miesięcy, rok przestępny, progi statusów i etykiety. Integracje z produkcyjną bazą oraz powiadomienia sprawdzaj w osobnym środowisku testowym.

## Obsługa formularzy i okien

Formularze pokazują następny termin oraz błędy przy danych, bez kasowania wpisanej treści. Podczas zapisu blokują ponowne wysłanie i zamknięcie formularza. Okna zatrzymują fokus klawiatury i zamykają się klawiszem Escape; ekran logowania wymaga zakończenia logowania. Przy braku internetu widoczny jest komunikat.
