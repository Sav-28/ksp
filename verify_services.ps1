# Checks the Catalyst service map and the read-through cache on the deployed app.
# Read-only: it issues GETs only, so it can be run at any time.
$ErrorActionPreference = "Stop"
$base = "https://ksp-api-50044161264.development.catalystappsail.in"
$login = Invoke-RestMethod -Uri "$base/api/login" -Method Post `
    -Body (@{ username = "investigator"; password = "invest@2024" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 120
$h = @{ Authorization = "Bearer $($login.token)" }

$svc = Invoke-RestMethod -Uri "$base/api/system/services" -Headers $h -TimeoutSec 120
Write-Host "--- service map ---" -ForegroundColor Cyan
$svc.services | ForEach-Object { "{0,-14} {1}" -f $_.status, $_.service }
Write-Host ("summary : " + ($svc.summary.by_status | ConvertTo-Json -Compress))
Write-Host ("sdk     : init_ok_once=$($svc.sdk.initialised_at_least_once) " +
            "captures=$($svc.sdk.gateway_headers_captured) " +
            "header_age=$($svc.sdk.gateway_headers_age_seconds)s " +
            "stratus_err=$($svc.sdk.last_stratus_error)")

Write-Host "`n--- cached endpoints: first call, then repeat ---" -ForegroundColor Cyan
foreach ($path in @("/api/sociological", "/api/hotspots", "/api/compliance/report")) {
    foreach ($pass in 1, 2) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $r = Invoke-RestMethod -Uri "$base$path" -Headers $h -TimeoutSec 180
            $sw.Stop()
            $src = if ($r.PSObject.Properties.Name -contains "cache") { $r.cache.source } else { "(no cache field)" }
            "{0,-26} pass {1}  {2,6} ms  source={3}" -f $path, $pass, $sw.ElapsedMilliseconds, $src
        } catch {
            $sw.Stop()
            "{0,-26} pass {1}  ERROR {2}" -f $path, $pass, $_.Exception.Message
        }
    }
}

$svc2 = Invoke-RestMethod -Uri "$base/api/system/services" -Headers $h -TimeoutSec 120
$cacheEntry = $svc2.services | Where-Object { $_.service -eq "Cache" }
Write-Host "`nCache after traffic: $($cacheEntry.status)" -ForegroundColor Cyan
Write-Host "  $($cacheEntry.detail)"
$stratusEntry = $svc2.services | Where-Object { $_.service -like "Stratus*" }
Write-Host "Stratus            : $($stratusEntry.status)" -ForegroundColor Cyan
Write-Host "  $($stratusEntry.detail)"
