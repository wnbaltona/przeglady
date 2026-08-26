param(
    [Parameter(Mandatory = $true)]
    [string]$WorkbookPath
)

$ErrorActionPreference = 'Stop'

# Supabase wymaga nowoczesnego połączenia TLS. Na części instalacji Windows
# Windows PowerShell domyślnie używa starszego protokołu i odrzuca żądanie.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-RequiredEnvironmentVariable([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name, 'User')
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Brak zmiennej środowiskowej $Name. Ustaw ją zgodnie z instrukcją EXCEL_POWER_AUTOMATE_INSTRUKCJA.md."
    }
    return $value.Trim()
}

function Get-Status([int]$DaysUntilExpiry) {
    if ($DaysUntilExpiry -lt 0) { return 'PO TERMINIE' }
    if ($DaysUntilExpiry -le 30) { return 'DO WYKONANIA' }
    return 'AKTUALNE'
}

function Should-SendAlert([int]$DaysUntilExpiry) {
    return $DaysUntilExpiry -ge 0 -and $DaysUntilExpiry -le 14
}

function ConvertTo-InspectionDate($Value) {
    if ($Value -is [datetime]) { return $Value.Date }

    $text = [string]$Value
    $formats = @('yyyy-MM-dd', 'yyyy-MM-ddTHH:mm:ss', 'yyyy-MM-ddTHH:mm:ss.fffZ', 'dd.MM.yyyy', 'dd/MM/yyyy')
    foreach ($format in $formats) {
        $parsed = [datetime]::MinValue
        if ([datetime]::TryParseExact($text, $format, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AllowWhiteSpaces, [ref]$parsed)) {
            return $parsed.Date
        }
    }

    $fallback = [datetime]::MinValue
    if ([datetime]::TryParse($text, [Globalization.CultureInfo]::GetCultureInfo('pl-PL'), [Globalization.DateTimeStyles]::AllowWhiteSpaces, [ref]$fallback)) {
        return $fallback.Date
    }

    throw "Nieprawidłowa data przeglądu: $text"
}

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
    throw "Nie znaleziono pliku Excel: $WorkbookPath"
}

$supabaseUrl = (Get-RequiredEnvironmentVariable 'SUPABASE_URL').TrimEnd('/')
$serviceRoleKey = Get-RequiredEnvironmentVariable 'SUPABASE_SERVICE_ROLE_KEY'
$headers = @{ apikey = $serviceRoleKey; Authorization = "Bearer $serviceRoleKey" }
$today = (Get-Date).Date
$synchronisedAt = Get-Date

$inspectionsUrl = "$supabaseUrl/rest/v1/inspections?select=id,city,local,type,done,months&deleted_at=is.null"
$inspections = Invoke-RestMethod -Uri $inspectionsUrl -Method Get -Headers $headers
if ($inspections -isnot [System.Array]) {
    $inspections = @($inspections)
}

$rows = @()
foreach ($inspection in $inspections) {
    $completedOn = $null
    $expiresOn = $null
    $daysUntilExpiry = $null
    $status = 'BRAK DANYCH'
    $sendAlert = 'NIE'

    if (-not [string]::IsNullOrWhiteSpace($inspection.done) -and $inspection.months) {
        try {
            $completedOn = ConvertTo-InspectionDate $inspection.done
            $expiresOn = $completedOn.AddMonths([int]$inspection.months)
            $daysUntilExpiry = [int](($expiresOn.Date - $today).TotalDays)
            $status = Get-Status $daysUntilExpiry
            $sendAlert = if (Should-SendAlert $daysUntilExpiry) { 'TAK' } else { 'NIE' }
        }
        catch {
            $status = 'BRAK DANYCH'
        }
    }

    $rows += ,@(
        [string]$inspection.id,
        [string]$inspection.city,
        [string]$inspection.local,
        [string]$inspection.type,
        $completedOn,
        [int]$inspection.months,
        $expiresOn,
        $daysUntilExpiry,
        $status,
        $sendAlert,
        $synchronisedAt
    )
}

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($WorkbookPath)
    $sheet = $workbook.Worksheets.Item('Alerty Power Automate')

    # Nie usuwamy tabeli. Power Automate zapamiętuje jej wewnętrzny identyfikator,
    # więc utworzenie jej od nowa zrywa połączenie przepływu z plikiem Excel.
    $table = $null
    foreach ($listObject in @($sheet.ListObjects)) {
        if ($listObject.Name -eq 'AlertyPowerAutomate') {
            $table = $listObject
            break
        }
    }

    $sheet.Range('A3:K10000').ClearContents()
    $headerRow = @('ID', 'Miasto', 'Lokal', 'Rodzaj przegladu', 'Data wykonania', 'Wazny przez (mies.)', 'Termin waznosci', 'Dni do terminu', 'Status', 'Do wysylki', 'Ostatnia synchronizacja')
    $headerValues = New-Object 'object[,]' 1, 11
    for ($column = 0; $column -lt 11; $column++) {
        $headerValues[0, $column] = $headerRow[$column]
    }
    $sheet.Range('A3:K3').Value2 = $headerValues

    if ($rows.Count -gt 0) {
        $lastRow = $rows.Count + 3
        $dataValues = New-Object 'object[,]' $rows.Count, 11
        for ($rowIndex = 0; $rowIndex -lt $rows.Count; $rowIndex++) {
            for ($column = 0; $column -lt 11; $column++) {
                $dataValues[$rowIndex, $column] = $rows[$rowIndex][$column]
            }
        }
        $sheet.Range("A4:K$lastRow").Value2 = $dataValues
    }
    else {
        $lastRow = 4
    }

    # Stały zakres jest celowy: Excel Online / Power Automate identyfikuje tabelę
    # po jej wewnętrznym identyfikatorze. Zmiana zakresu przy każdej synchronizacji
    # potrafi odświeżyć metadane konektora i spowodować błąd "table not found".
    # 1000 wierszy to zapas na przyszłe przeglądy; puste wiersze są odfiltrowane
    # przez warunek "Do wysylki = TAK" w przepływie.
    $tableCapacity = 1000
    if ($rows.Count -gt $tableCapacity) {
        throw "Liczba przeglądów ($($rows.Count)) przekracza pojemność tabeli ($tableCapacity)."
    }
    $tableLastRow = $tableCapacity + 3
    $tableRange = $sheet.Range("A3:K$tableLastRow")
    if ($table) {
        # W zwykłej synchronizacji nie dotykamy struktury tabeli. Nawet ponowne
        # wywołanie Resize z takim samym zakresem może odświeżyć metadane widziane
        # przez Excel Online. Zmiana zakresu nastąpi tylko wtedy, gdy jest konieczna.
        $expectedTableRowCount = $tableCapacity + 1 # nagłówek + dane
        if ($table.Range.Row -ne 3 -or $table.Range.Rows.Count -ne $expectedTableRowCount -or $table.Range.Columns.Count -ne 11) {
            [void]$table.Resize($tableRange)
        }
    }
    else {
        $table = $sheet.ListObjects.Add(1, $tableRange, $null, 1)
        $table.Name = 'AlertyPowerAutomate'
        $table.TableStyle = 'TableStyleMedium2'
    }

    # Polski Excel używa "rrrr" jako symbolu roku. NumberFormatLocal
    # zapewnia prawidłowy wygląd dat niezależnie od ustawień językowych Office.
    $sheet.Columns.Item('E').NumberFormatLocal = 'rrrr-mm-dd'
    $sheet.Columns.Item('G').NumberFormatLocal = 'rrrr-mm-dd'
    $sheet.Columns.Item('K').NumberFormatLocal = 'rrrr-mm-dd gg:mm'
    $workbook.Save()
}
finally {
    if ($workbook) { $workbook.Close($true) }
    if ($excel) { $excel.Quit() }
    if ($sheet) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) }
    if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Output "Zsynchronizowano $($rows.Count) przeglądów do pliku: $WorkbookPath"
