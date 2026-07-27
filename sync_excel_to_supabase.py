"""Automatyczna synchronizacja arkusza 'Przeglądy' z Supabase.

Wymagane zmienne środowiskowe:
  SUPABASE_URL=https://twoj-projekt.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=...  (sekretny klucz, nigdy do aplikacji WWW)
"""
import datetime as dt
import json
import os
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

import openpyxl


def norm(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(c for c in text if not unicodedata.combining(c)).lower().strip()


def date(value):
    if not value:
        return None
    if isinstance(value, (dt.datetime, dt.date)):
        return value.strftime("%Y-%m-%d")
    try:
        return dt.datetime.fromisoformat(str(value)).strftime("%Y-%m-%d")
    except ValueError:
        return None


def main():
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    excel = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("przeglądy.xlsx")
    if not url or not key:
        raise SystemExit("Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY w zmiennych środowiskowych.")
    if not excel.exists():
        raise SystemExit(f"Nie znaleziono pliku Excel: {excel}")

    book = openpyxl.load_workbook(excel, data_only=True, read_only=True)
    sheet = next((book[n] for n in book.sheetnames if "przeglad" in norm(n)), None)
    if sheet is None:
        raise SystemExit("Nie znaleziono arkusza 'Przeglądy'.")
    headers = [norm(c.value) for c in next(sheet.iter_rows(min_row=1, max_row=1))]

    def value(row, phrase):
        index = next((i for i, h in enumerate(headers) if phrase in h), None)
        return row[index] if index is not None else None

    records = []
    for excel_row, cells in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
        city, local, kind = value(cells, "miasto"), value(cells, "nr lokalu"), value(cells, "rodzaj przegl")
        if not any((city, local, kind)):
            continue
        months = value(cells, "wazny przez") or 12
        try:
            months = int(months)
        except (TypeError, ValueError):
            months = 12
        records.append({
            "id": f"seed-{excel_row - 1}", "city": str(city or "").strip(),
            "local": str(local or "").strip(), "type": str(kind or "").strip(),
            "done": date(value(cells, "data wykon")), "months": months,
            "protocol_date": date(value(cells, "data dodania protokol")),
            "notes": str(value(cells, "uwagi") or "").strip(),
        })
    request = urllib.request.Request(
        f"{url}/rest/v1/inspections?on_conflict=id", data=json.dumps(records).encode(), method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"},
    )
    try:
        with urllib.request.urlopen(request) as response:
            print(f"Zsynchronizowano {len(records)} wpisów (HTTP {response.status}).")
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Supabase zwrócił HTTP {error.code}: {error.read().decode(errors='replace')}")


if __name__ == "__main__":
    main()
