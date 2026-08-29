# Reads GET /api/system/zia-probe off the deployed app and prints the RAW Zia
# responses. This is the gate for the Zia feature work: if the calls do not return
# here, they will not return in a feature either.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$base = "https://ksp-api-50044161264.development.catalystappsail.in"
$login = Invoke-RestMethod -Uri "$base/api/login" -Method Post `
    -Body (@{ username = "investigator"; password = "invest@2024" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 120
$h = @{ Authorization = "Bearer $($login.token)" }

$p = Invoke-RestMethod -Uri "$base/api/system/zia-probe" -Headers $h -TimeoutSec 180

Write-Host "sample: $($p.sample_document)" -ForegroundColor DarkGray
foreach ($name in $p.attempts.PSObject.Properties.Name) {
    $a = $p.attempts.$name
    Write-Host "`n=== $name ===" -ForegroundColor Cyan
    "returned    : $($a.returned)"
    "python_type : $($a.python_type)"
    if ($a.error) { Write-Host "error       : $($a.error)" -ForegroundColor Red }
    if ($a.returned) { "raw         :"; $a.raw | ConvertTo-Json -Depth 10 }
}
Write-Host "`n=== sdk ===" -ForegroundColor Cyan
"zia_succeeded_at_least_once : $($p.sdk.zia_succeeded_at_least_once)"
"last_zia_error              : $($p.sdk.last_zia_error)"
"initialised_at_least_once   : $($p.sdk.initialised_at_least_once)"
