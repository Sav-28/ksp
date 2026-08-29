# Phase B of the persistence proof: the write must survive losing /tmp.
#
# Order:
#   1. .\verify_deploy.ps1     registers the probe FIR and confirms it reached Stratus
#   2. .\deploy.ps1            redeploys, which cold-starts the instance and wipes /tmp
#   3. .\verify_restart.ps1    this script - checks the probe FIR is still there
#
# The deploy is deliberately NOT called from here: piping a nested deploy's
# stderr through 2>&1 turns the node deprecation warning into a PowerShell error
# record, which aborts the script under ErrorActionPreference=Stop.
$ErrorActionPreference = "Stop"
$base = "https://ksp-api-50044161264.development.catalystappsail.in"
$firFile = Join-Path $PSScriptRoot "verify_probe_fir.txt"
if (-not (Test-Path $firFile)) {
    Write-Host "Run verify_deploy.ps1 first - no probe FIR recorded." -ForegroundColor Red
    exit 1
}
$fir = (Get-Content $firFile -Raw).Trim()

$login = Invoke-RestMethod -Uri "$base/api/login" -Method Post `
    -Body (@{ username = "investigator"; password = "invest@2024" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 120
$h = @{ Authorization = "Bearer $($login.token)" }

# That login was the first request, so the restore has already been attempted.
$info = Invoke-RestMethod -Uri "$base/api/system/info" -Headers $h -TimeoutSec 120
$p = $info.persistence
Write-Host "--- state after the cold start ---" -ForegroundColor Cyan
"restore_attempted : $($p.restore_attempted)"
"restore_result    : $($p.restore_result)"
"uploads_completed : $($p.uploads_completed)"
"crimes in db      : $($info.data.crimes)"
"persistent        : $($info.database.persistent)"
"note              : $($info.database.note)"

$found = $null
try { $found = Invoke-RestMethod -Uri "$base/api/crime/$fir" -Headers $h -TimeoutSec 120 }
catch { $found = $null }

Write-Host "`n=== ROUND-TRIP VERDICT ===" -ForegroundColor Magenta
Write-Host "looking for FIR $fir" -ForegroundColor DarkGray
if ($found -and $found.fir_number -eq $fir) {
    Write-Host "PASS: the FIR survived a cold start that wiped /tmp." -ForegroundColor Green
    Write-Host "      restore_result=$($p.restore_result)" -ForegroundColor Green
    Write-Host "      description='$($found.description)'" -ForegroundColor Green
} else {
    Write-Host "FAIL: the FIR is gone after the restart. restore_result=$($p.restore_result)" -ForegroundColor Red
}
