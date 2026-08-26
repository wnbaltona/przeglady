$ErrorActionPreference = 'Stop'

function ConvertTo-Base64Url([byte[]]$Bytes) {
    return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$ecdsa = New-Object System.Security.Cryptography.ECDsaCng
$ecdsa.KeySize = 256

try {
    $parameters = $ecdsa.ExportParameters($true)
    $publicBytes = [byte[]]::new(65)
    $publicBytes[0] = 4
    [Array]::Copy($parameters.Q.X, 0, $publicBytes, 1, 32)
    [Array]::Copy($parameters.Q.Y, 0, $publicBytes, 33, 32)

    $randomBytes = [byte[]]::new(32)
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($randomBytes)
    }
    finally {
        $generator.Dispose()
    }

    Write-Host ''
    Write-Host 'PUBLIC_KEY (może być w supabase-config.js):' -ForegroundColor Green
    Write-Host (ConvertTo-Base64Url $publicBytes)
    Write-Host ''
    Write-Host 'PRIVATE_KEY (tylko Supabase Secrets — nie publikuj):' -ForegroundColor Yellow
    Write-Host (ConvertTo-Base64Url $parameters.D)
    Write-Host ''
    Write-Host 'CRON_SECRET (Supabase Secrets oraz Vault — nie publikuj):' -ForegroundColor Yellow
    Write-Host (ConvertTo-Base64Url $randomBytes)
    Write-Host ''
}
finally {
    if ($null -ne $ecdsa) {
        $ecdsa.Dispose()
    }
}
