# Read-only health sweep of every API surface on the deployed app, plus the
# React bundle. Reports status and latency per endpoint and exits non-zero if any
# of them fail, so it can be used as a go/no-go check before a demo.
$ErrorActionPreference = "Stop"
# Without this, Invoke-WebRequest's progress stream floods the transcript.
$ProgressPreference = "SilentlyContinue"
$base = "https://ksp-api-50044161264.development.catalystappsail.in"
$login = Invoke-RestMethod -Uri "$base/api/login" -Method Post `
    -Body (@{ username = "investigator"; password = "invest@2024" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 120
$h = @{ Authorization = "Bearer $($login.token)" }

# Every GET route with no path parameter, taken from /openapi.json rather than
# typed by hand, so this list cannot drift away from what the app actually serves.
# Parameterised routes are exercised separately below with real ids.
$paths = @(
    "/api/health", "/api/me",
    "/api/system/info", "/api/system/services", "/api/system/catalyst-probe",
    "/api/system/zia-probe",
    "/api/stats", "/api/sociological", "/api/hotspots", "/api/anomalies",
    "/api/clearance", "/api/forecast", "/api/gangs", "/api/offenders",
    "/api/officer-caseload", "/api/patterns/mo", "/api/trends/seasonal",
    "/api/model/metrics", "/api/financial/trails",
    "/api/network/overview", "/api/network/search",
    "/api/reference/registration",
    "/api/compliance/report", "/api/compliance/stations",
    "/api/compliance/custody-clock", "/api/compliance/digest?send=false",
    # Returns a PDF when SmartBrowz renders, otherwise a print-ready HTML page.
    # Either is a 200; the renderer is named in the X-Report-Renderer header.
    "/api/compliance/report.pdf"
)

# /api/audit is role-gated, so it is checked as the supervisor instead. An
# investigator getting 403 there is correct behaviour, not a failure.
$sup = Invoke-RestMethod -Uri "$base/api/login" -Method Post `
    -Body (@{ username = "supervisor"; password = "super@2024" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 120
$supH = @{ Authorization = "Bearer $($sup.token)" }

$fail = 0
foreach ($p in $paths) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri "$base$p" -Headers $h -TimeoutSec 180
        $sw.Stop()
        "{0,-42} {1}  {2,6} ms  {3,8} bytes" -f $p, $r.StatusCode, $sw.ElapsedMilliseconds, $r.RawContentLength
    } catch {
        $sw.Stop()
        $code = try { [int]$_.Exception.Response.StatusCode } catch { "ERR" }
        "{0,-42} {1}  {2,6} ms  FAILED" -f $p, $code, $sw.ElapsedMilliseconds
        $fail++
    }
}


# Role-gated and parameterised routes, using ids resolved from live data rather
# than hardcoded. /api/crimes is POST-only, so a real CrimeNo comes from the
# custody-clock listing instead.
$custody = Invoke-RestMethod -Uri "$base/api/compliance/custody-clock" -Headers $h -TimeoutSec 120
$fir = if ($custody.cases) { $custody.cases[0].crime_no } else { $null }
$offenders = Invoke-RestMethod -Uri "$base/api/offenders" -Headers $h -TimeoutSec 120
$personId = if ($offenders.offenders) { $offenders.offenders[0].person_id } else { $null }

$extra = @{}
$extra["/api/audit (as supervisor)"] = @{ url = "$base/api/audit"; head = $supH }
# Admin-only diagnostics added by the Catalyst depth build.
$adm = Invoke-RestMethod -Uri "$base/api/login" -Method Post `
    -Body (@{ username = "admin"; password = "admin@2024" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 120
$admH = @{ Authorization = "Bearer $($adm.token)" }
$extra["/api/system/jobs (as admin)"] = @{ url = "$base/api/system/jobs"; head = $admH }
$extra["/api/system/smartbrowz-probe (admin)"] = @{ url = "$base/api/system/smartbrowz-probe"; head = $admH }
if ($fir) {
    $extra["/api/crime/{fir}"]          = @{ url = "$base/api/crime/$fir";           head = $h }
    $extra["/api/cases/{fir}/summary"]  = @{ url = "$base/api/cases/$fir/summary";   head = $h }
    $extra["/api/cases/{fir}/similar"]  = @{ url = "$base/api/cases/$fir/similar";   head = $h }
}
if ($personId) {
    $extra["/api/person/{id}"]          = @{ url = "$base/api/person/$personId";          head = $h }
    $extra["/api/offenders/{id}"]       = @{ url = "$base/api/offenders/$personId";       head = $h }
    $extra["/api/network/person/{id}"]  = @{ url = "$base/api/network/person/$personId";  head = $h }
    $extra["/api/briefing/person/{id}"] = @{ url = "$base/api/briefing/person/$personId"; head = $h }
}
foreach ($label in $extra.Keys | Sort-Object) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $extra[$label].url -Headers $extra[$label].head -TimeoutSec 180
        $sw.Stop()
        "{0,-42} {1}  {2,6} ms  {3,8} bytes" -f $label, $r.StatusCode, $sw.ElapsedMilliseconds, $r.RawContentLength
    } catch {
        $sw.Stop()
        $code = try { [int]$_.Exception.Response.StatusCode } catch { "ERR" }
        "{0,-42} {1}  {2,6} ms  FAILED" -f $label, $code, $sw.ElapsedMilliseconds
        $fail++
    }
}

# The React build is served by the same process, so a broken static mount would
# leave the API healthy and the app blank.
try {
    $ui = Invoke-WebRequest -UseBasicParsing -Uri "$base/" -TimeoutSec 120
    $hasRoot = $ui.Content -match 'id="root"'
    "{0,-42} {1}  root div present: {2}" -f "/ (React bundle)", $ui.StatusCode, $hasRoot
    if (-not $hasRoot) { $fail++ }
} catch { "/ (React bundle) FAILED"; $fail++ }

Write-Host ""
if ($fail -eq 0) {
    Write-Host "ALL GREEN: $($paths.Count + $extra.Count) endpoints plus the UI." -ForegroundColor Green
} else {
    Write-Host "$fail check(s) FAILED." -ForegroundColor Red
    exit 1
}
