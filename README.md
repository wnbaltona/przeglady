# Rejestr Przeglądów

Aplikacja do obsługi terminów przeglądów, protokołów, historii zmian i powiadomień. Dane są przechowywane w Supabase.

## Publikacja

Opublikuj pliki `index.html`, `app.js`, `styles.css`, `layout.css`, `workspace.css`, `workspace.js`, `mobile-history.js`, `supabase-config.js`, `service-worker.js`, `manifest.webmanifest` i katalog `icons` razem na serwerze statycznym obsługującym HTTPS. W tej wersji wymagane są również pliki `layout.css`, `workspace.css` i `workspace.js`. Konfiguracja istniejącego projektu pozostaje w `supabase-config.js`.

Klucza `service_role` nie umieszczaj w plikach udostępnianych przez serwer WWW. Do pobierania danych wymagane jest połączenie z internetem. Na iPhonie aplikację można dodać do ekranu początkowego przez Safari.

## Edycja lokali

Przed pierwszą edycją uruchom `EDYCJA_LOKALI.sql` w Supabase > SQL Editor. Zmiana miasta, MPK lub nazwy aktualizuje słownik i powiązane przeglądy, także w koszu, w jednej transakcji. Funkcja używa uprawnień użytkownika i istniejących polityk RLS. Migracja została dostarczona, lecz nie została wykonana w produkcyjnej bazie. Przy kolejnych importach z Excela stosuj aktualne nazwy obiektów.

## Pliki pomocnicze

- `supabase-schema.sql` — schemat bazy.
- Pozostałe pliki SQL — uprawnienia, powiadomienia, naprawy i testy. Sprawdź ich zgodność z aktualną bazą przed wykonaniem.
- `supabase/functions` — funkcje serwerowe powiadomień.
- `PUSH_INSTRUKCJA.md` i `GENERUJ_KLUCZE_PUSH.ps1` — konfiguracja push.
- `sync_excel_to_supabase.py` — import Excela; zależności: `python -m pip install -r requirements.txt`.
- `sync_supabase_to_excel.ps1` — aktualizacja wskazanego arkusza; wymaga Microsoft Excel.
- Arkusze `.xlsx` — zachowane dane synchronizacji; nie są potrzebne do publikacji strony.

Skrypty synchronizacji wymagają `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` w zmiennych środowiskowych.

## Aktualny układ

`styles.css` zawiera motywy i style komponentów, `layout.css` wspólne reguły układu, a `workspace.css` i `workspace.js` definiują panel firmowy. Na komputerze jest zwinięte menu boczne z ikonami i etykietami po najechaniu lub ustawieniu fokusu klawiaturą; na telefonie dolna nawigacja. Pulpit pokazuje pilne przeglądy i trzy liczniki. Rejestr ma filtry i grupowanie według miast oraz lokali. Przeglądy lokalu są tabelą na komputerze i grupami rodzajów na telefonie. Kliknięcie przeglądu otwiera szczegóły; na komputerze szczegóły i formularz edycji mają postać panelu po prawej. Terminy i lokale są pełnymi widokami. Alerty otwierają się w oknie z przyciskiem ×, dostępnym przez dzwonek w nagłówku i nawigację. Ustawienia zbierają słowniki, kosz, motywy i konto. Usunięto z nich przycisk odświeżania. Menu boczne zawiera Pulpit, Lokale, Przeglądy, Terminy i Ustawienia (ikona koła zębatego), bez Alertów i zakładki Historii. Logo aplikacji jest widoczne w menu na komputerze i w nagłówku mobilnym. Zakładka Lokale ma wyszukiwarkę MPK, nazwy i miasta. Kropki kalendarza są w prawym dolnym rogu dnia.

## Weryfikacja nowego panelu

## Usprawnienia obsługi — 6 października

`mobile-history.js` obsługuje przycisk Wstecz telefonu i cofanie w przeglądarce przy widoku mobilnym. Najpierw zamyka otwarte okno lub menu, następnie pozwala wrócić do poprzedniej zakładki. Zamykanie przez × także usuwa wpis okna z historii. Publikuj ten plik razem z pozostałymi skryptami; jest wczytywany po `workspace.js`. Działanie sprawdzono w lokalnym podglądzie przez cofnięcie historii dla alertów, formularza oraz przejścia między widokami.

Ciemny motyw korzysta ze wspólnej granatowej palety dla panelu, nawigacji, tabel, kalendarza i okien. Poprawiono kontrast opisów, pól i statusów, wyróżnienie aktywnych filtrów oraz dzisiejszego dnia. Kontrolki dat, wybór pliku i paski przewijania także korzystają z ciemnego wyglądu. Sprawdzono lokalny podgląd pulpitu, kalendarza, lokali, szczegółów i formularza w szerokościach 390 i 1366 px oraz zachowanie motywu po przeładowaniu.

- Filtry, sortowanie i rozwinięte lokale są zapamiętywane w obrębie sesji przeglądarki, oddzielnie dla każdego konta. Formularz przywraca pozycję przewijania po zapisie lub anulowaniu.
- Przegląd można dodać z rozwiniętego lokalu albo z zakładki Lokale; miasto i lokal są już wpisane w formularzu.
- Wyszukiwanie pomija polskie znaki, także „ł”. Domyślne sortowanie przeglądów lokalu zaczyna się od najbliższego terminu; dotyczy także grup rodzajów na telefonie.
- Zapis potwierdza krótki komunikat. Dzisiaj wraca do bieżącego miesiąca i zaznacza dzisiejszy dzień.
- Przyciski zamykania oraz rozwijane nagłówki mają większe obszary dotyku. Menu usunięto z nagłówka; pozostaje na dolnym pasku telefonu.

Sprawdzono dodawanie z lokalu, przywracanie wyszukiwania i rozwinięć po przeładowaniu, dostęp do dolnego menu i przycisk Dzisiaj w lokalnym podglądzie. Widoki 390 i 1366 px nie miały poziomego przepełnienia. Testy pomocników potwierdziły wyszukiwanie bez polskich znaków, pamięć filtrów i komunikat zapisu. Zapisów do bazy produkcyjnej nie wykonywano.

### Weryfikacja wcześniejszego panelu

Podgląd używa danych demonstracyjnych i nie łączy się z produkcyjną bazą. Sprawdzono składnię JavaScript, formatowanie i test formularza lokalu z atrapą bazy. W przeglądarce zweryfikowano pulpit, rejestr, kalendarz (także miesiąc z sześcioma tygodniami), lokale, alerty i szczegóły przy szerokościach 320, 390, 801 i 1440 px. Sprawdzono filtrowanie po statusie, wyszukiwanie, sortowanie i otwarcie edycji ze szczegółów. Nie wykryto poziomego przepełnienia strony ani błędów JavaScript podczas tych prób. Pliki demonstracyjne i serwer podglądu nie są dołączone do archiwum.

## Wcześniejsza weryfikacja komponentów

W przeglądarce sprawdzono dane demonstracyjne przy szerokościach 320, 390, 699 i 1440 px. Zweryfikowano ekran główny, rozwijanie list, kalendarz, formularz, alerty i menu. Pomiary potwierdziły brak poziomego przepełnienia na sprawdzonych ekranach, mieszczący się kalendarz i jego przyciski oraz wyśrodkowanie okna listy lokali. Sprawdzono składnię i formatowanie oraz testy obsługi paska nawigacji i formularza lokalu z atrapą bazy.

Do archiwum nie dodano danych demonstracyjnych ani serwera podglądu. Integracje produkcyjne, powiadomienia i transakcja edycji lokalu wymagają sprawdzenia w docelowym środowisku.

## Instalacja systemowa

Instalację proponuje przeglądarka na podstawie manifestu, ikon oraz rejestracji service workera. Aplikacja nie przechwytuje `beforeinstallprompt` i nie wyświetla własnego okna instalacji. Czas i forma propozycji zależą od przeglądarki; strona nie może wymusić systemowego okna przy każdym wejściu. Na iPhonie można dodać stronę z Safari przez Udostępnij → Do ekranu początkowego. Publikuj stronę przez HTTPS razem z manifestem, service workerem i ikonami. Identyfikator i zakres istniejącej aplikacji PWA pozostały takie same.
