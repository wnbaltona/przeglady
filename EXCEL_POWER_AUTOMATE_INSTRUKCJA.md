# Alerty przeglądów: aplikacja → Excel → Power Automate → Outlook

## Jak działa rozwiązanie

1. Aplikacja zapisuje przeglądy w Supabase.
2. Skrypt `sync_supabase_to_excel.ps1` aktualizuje tabelę `AlertyPowerAutomate` w pliku Excel.
3. Power Automate codziennie odczytuje wiersze, gdzie `Do wysyłki` ma wartość `TAK`, i wysyła zbiorczą wiadomość przez Outlook.

Nie wymaga to Power Automate Premium, Resend ani domeny do wysyłki.

## 1. Przygotuj plik w OneDrive

Przenieś plik `przeglądy-alerty.xlsx` z folderu aplikacji do OneDrive firmowego, np.:

```text
C:\Users\wniziolek\OneDrive - Baltona\przeglądy-alerty.xlsx
```

W Power Automate wybierz później właśnie ten plik i tabelę `AlertyPowerAutomate`.

## 2. Ustaw dane dostępu lokalnie

Otwórz PowerShell i ustaw dwa parametry tylko na swoim komputerze:

```powershell
[Environment]::SetEnvironmentVariable('SUPABASE_URL', 'https://bsisclhysmvzqgggnpna.supabase.co', 'User')
[Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'WKLEJ_TUTAJ_SERVICE_ROLE_KEY_Z_SUPABASE', 'User')
```

Klucz znajdziesz w Supabase: **Project Settings > API Keys**. Nie zapisuj go w plikach, GitHubie ani na czacie.

## 3. Przetestuj synchronizację

Zamknij plik Excel, otwórz nowe okno PowerShell i uruchom:

```powershell
& 'C:\Users\wniziolek\Downloads\przeglady-main (2)\przeglady-main\sync_supabase_to_excel.ps1' -WorkbookPath 'C:\Users\wniziolek\OneDrive - Baltona\przeglądy-alerty.xlsx'
```

Po uruchomieniu otwórz plik i kartę **Alerty Power Automate**. Powinna zawierać aktualne przeglądy oraz kolumny `Status` i `Do wysyłki`.

## 4. Ustaw automatyczne odświeżanie Excela

W **Harmonogramie zadań** Windows utwórz zadanie, które uruchamia się co godzinę:

- Program/skrypt:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
```

- Argumenty:

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\Users\wniziolek\Downloads\przeglady-main (2)\przeglady-main\sync_supabase_to_excel.ps1" -WorkbookPath "C:\Users\wniziolek\OneDrive - Baltona\przeglądy-alerty.xlsx"
```

Ustaw uruchamianie tylko, gdy użytkownik jest zalogowany. Plik nie może być otwarty w desktopowym Excelu w chwili synchronizacji.

## 5. Utwórz przepływ Power Automate (bez Premium)

1. W Power Automate wybierz **Utwórz > Zaplanowany przepływ w chmurze** i ustaw uruchamianie raz dziennie, np. o 08:15.
2. Dodaj akcję **Excel Online (Business) > Lista wierszy obecnych w tabeli**.
3. Wybierz lokalizację OneDrive firmowy, plik `przeglądy-alerty.xlsx` oraz tabelę `AlertyPowerAutomate`.
4. Dodaj akcję **Filtruj tablicę** z warunkiem:

```text
Do wysyłki  jest równe  TAK
```

5. Dodaj warunek: długość wyniku z „Filtruj tablicę” jest większa niż `0`.
6. W gałęzi „Tak” dodaj **Office 365 Outlook > Wyślij wiadomość e-mail (V2)**. W polu treści użyj wyniku „Filtruj tablicę”; można zacząć od prostej tabeli HTML utworzonej w akcji **Utwórz tabelę HTML**.

## Reguły w pliku Excel

- `Status = DO WYKONANIA`: termin jest za 30 dni lub mniej.
- `Do wysyłki = TAK`: codziennie od 14 dni do terminu.
- `Status = PO TERMINIE`: termin minął, bez automatycznej wiadomości.
