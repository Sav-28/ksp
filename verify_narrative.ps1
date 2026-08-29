# Exercises POST /api/narrative/analyse on the deployed app with a realistic
# complainant statement, then confirms the Zia inventory entry reports live.
# Read-only: analysis stores nothing.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$base = "https://ksp-api-50044161264.development.catalystappsail.in"
$login = Invoke-RestMethod -Uri "$base/api/login" -Method Post `
    -Body (@{ username = "investigator"; password = "invest@2024" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 120
$h = @{ Authorization = "Bearer $($login.token)" }

$statement = "On 14 August 2026 at about 9 PM, the complainant Ramesh Kumar was " +
    "returning to Jayanagar in Bengaluru when two men on a black Pulsar motorcycle " +
    "snatched his gold chain worth Rs 85,000 near the bus stand and fled towards " +
    "Wilson Garden. The accused Imran Shaikh was later identified."

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$r = Invoke-RestMethod -Uri "$base/api/narrative/analyse" -Method Post `
    -Body (@{ text = $statement } | ConvertTo-Json) -ContentType "application/json" `
    -Headers $h -TimeoutSec 180
$sw.Stop()

Write-Host "engine        : $($r.engine)   ($($sw.ElapsedMilliseconds) ms)" -ForegroundColor Cyan
"crime_type    : $($r.suggested_crime_type)"
"ipc           : $($r.suggested_ipc)"
"district      : $($r.suggested_district)"
"persons       : $($r.entities.persons -join ' | ')"
"places        : $($r.entities.places -join ' | ')"
"vehicles      : $($r.entities.vehicles -join ' | ')"
"valuables     : $($r.entities.valuables -join ' | ')"
"money         : $(($r.entities.money | ForEach-Object { $_.token }) -join ' | ')"
"dates / times : $($r.entities.dates -join ' | ')  /  $($r.entities.times -join ' | ')"
"keyphrases    : $($r.keyphrases -join ' | ')"
"sentiment     : $($r.sentiment.label) ($($r.sentiment.score))"
Write-Host "note          : $($r.engine_note)" -ForegroundColor DarkGray

$svc = Invoke-RestMethod -Uri "$base/api/system/services" -Headers $h -TimeoutSec 120
$zia = $svc.services | Where-Object { $_.service -eq "Zia Text Analytics" }
Write-Host "`nZia inventory status: $($zia.status)" -ForegroundColor Cyan
Write-Host ("by_status: " + ($svc.summary.by_status | ConvertTo-Json -Compress))

if ($r.engine -eq "zia" -and $zia.status -eq "live") {
    Write-Host "`nPASS: Zia answered on the real request path and the inventory reports it live." -ForegroundColor Green
} else {
    Write-Host "`nFAIL: engine=$($r.engine), Zia status=$($zia.status)" -ForegroundColor Red
    exit 1
}
