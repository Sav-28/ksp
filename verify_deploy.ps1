# Verifies the deployed AppSail app: auth, persistence reporting, service map,
# and the Stratus write-back half of the round trip. Phase B (restart survival)
# is a separate step because it needs a redeploy in between.
# Read-only apart from registering ONE test FIR. Touches no local config file.
$ErrorActionPreference = "Stop"
$base = "https://ksp-api-50044161264.development.catalystappsail.in"

function Show($label, $obj) {
    Write-Host "`n--- $label ---" -ForegroundColor Cyan
    $obj | ConvertTo-Json -Depth 6
}

# 1. Login -------------------------------------------------------------------
$loginBody = @{ username = "investigator"; password = "invest@2024" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$base/api/login" -Method Post -Body $loginBody `
    -ContentType "application/json" -TimeoutSec 120
Write-Host "1. Login OK as $($login.name) [$($login.role)] can_register=$($login.can_register)" -ForegroundColor Green
$h = @{ Authorization = "Bearer $($login.token)" }

# 2. Persistence reporting BEFORE any write ---------------------------------
$before = Invoke-RestMethod -Uri "$base/api/system/info" -Headers $h -TimeoutSec 120
Show "2. /api/system/info BEFORE write" $before

# 3. Service map -------------------------------------------------------------
$svc = Invoke-RestMethod -Uri "$base/api/system/services" -Headers $h -TimeoutSec 120
Write-Host "`n--- 3. /api/system/services ---" -ForegroundColor Cyan
$svc.services | ForEach-Object { "{0,-22} {1,-10} {2}" -f $_.name, $_.status, $_.detail }
Write-Host ("summary: " + ($svc.summary | ConvertTo-Json -Compress))

# 4. Register a test FIR -----------------------------------------------------
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$firBody = @{
    crime_type    = "Theft"
    district      = "Bengaluru City"
    police_station= "Persistence Test PS"
    date_occurred = (Get-Date).ToString("yyyy-MM-dd")
    description   = "PERSISTENCE PROBE $stamp - registered to verify Stratus round trip"
    investigating_officer = "Verification Script"
} | ConvertTo-Json
$fir = Invoke-RestMethod -Uri "$base/api/crimes" -Method Post -Body $firBody `
    -ContentType "application/json" -Headers $h -TimeoutSec 120
Write-Host "`n4. Registered FIR: $($fir.fir_number)" -ForegroundColor Green
$fir | ConvertTo-Json -Depth 4

# 5. Wait out the flush debounce (8s) then re-check --------------------------
Write-Host "`n5. Waiting 20s for the debounced Stratus upload..." -ForegroundColor Cyan
Start-Sleep -Seconds 20
$after = Invoke-RestMethod -Uri "$base/api/system/info" -Headers $h -TimeoutSec 120
Show "5. /api/system/info AFTER write" $after

# 6. Verdict -----------------------------------------------------------------
Write-Host "`n=== VERDICT ===" -ForegroundColor Magenta
$p = $after.persistence
"mechanism          : $($p.mechanism)"
"object_key         : $($p.object_key)"
"restore_attempted  : $($p.restore_attempted)"
"restore_result     : $($p.restore_result)"
"uploads_completed  : $($p.uploads_completed)"
"last_upload_ok     : $($p.last_upload_ok)"
"last_upload_error  : $($p.last_upload_error)"
"pending_changes    : $($p.pending_changes)"
"persistent (db)    : $($after.database.persistent)"
if ($p.uploads_completed -ge 1 -and $p.last_upload_ok -eq $true) {
    Write-Host "PASS: the SQLite file reached Stratus. Next: redeploy, then confirm $($fir.fir_number) still exists." -ForegroundColor Green
} else {
    Write-Host "FAIL: no successful upload to Stratus yet. See last_upload_error above." -ForegroundColor Red
}
Set-Content -Path (Join-Path $PSScriptRoot "verify_probe_fir.txt") -Value $fir.fir_number
Write-Host "Probe FIR number saved to verify_probe_fir.txt" -ForegroundColor DarkGray
