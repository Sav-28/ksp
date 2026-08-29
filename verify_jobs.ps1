# Checks the scheduled-digest path on the deployed app:
#   1. the scheduler token authenticates the digest endpoint, and only that one
#   2. a wrong token is refused
#   3. /api/system/jobs reports the real prerequisites
#   4. if a jobpool exists, create the cron and show it
#
# The token is read from app-config.json (gitignored) and is never printed.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$base = "https://ksp-api-50044161264.development.catalystappsail.in"
$root = $PSScriptRoot

$cfg = Get-Content (Join-Path $root "app-config.json") -Raw | ConvertFrom-Json
$jobToken = [string]$cfg.env_variables.KSP_JOB_TOKEN
if ([string]::IsNullOrWhiteSpace($jobToken)) {
    Write-Host "KSP_JOB_TOKEN is not set in app-config.json - nothing to check." -ForegroundColor Yellow
    exit 0
}
Write-Host "Using the scheduler token from app-config.json ($($jobToken.Length) chars, not printed)." -ForegroundColor DarkGray

$admin = Invoke-RestMethod -Uri "$base/api/login" -Method Post `
    -Body (@{ username = "admin"; password = "admin@2024" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 120
$adminH = @{ Authorization = "Bearer $($admin.token)" }
$jobH = @{ "X-KSP-Job-Token" = $jobToken }

$fail = 0

# 1. The scheduler token authenticates the digest.
try {
    $d = Invoke-RestMethod -Uri "$base/api/compliance/digest?send=false" -Headers $jobH -TimeoutSec 180
    if ($d.requested_by -eq "scheduler") {
        Write-Host "PASS  digest accepts the scheduler token (requested_by=scheduler)" -ForegroundColor Green
    } else {
        Write-Host "FAIL  digest reported requested_by=$($d.requested_by)" -ForegroundColor Red; $fail++
    }
    if ($d.PSObject.ToString() -like "*$jobToken*") {
        Write-Host "FAIL  the digest response echoed the token" -ForegroundColor Red; $fail++
    }
} catch {
    Write-Host "FAIL  digest rejected a valid scheduler token: $($_.Exception.Message)" -ForegroundColor Red; $fail++
}

# 2. A wrong token is refused.
try {
    Invoke-RestMethod -Uri "$base/api/compliance/digest" -Headers @{ "X-KSP-Job-Token" = "wrong" } -TimeoutSec 120 | Out-Null
    Write-Host "FAIL  a wrong scheduler token was accepted" -ForegroundColor Red; $fail++
} catch {
    $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    if ($code -eq 401) { Write-Host "PASS  a wrong scheduler token is refused (401)" -ForegroundColor Green }
    else { Write-Host "FAIL  wrong token gave $code, expected 401" -ForegroundColor Red; $fail++ }
}

# 3. The token must not open any other route.
$leaked = @()
foreach ($p in @("/api/compliance/report", "/api/stats", "/api/system/info",
                 "/api/system/services", "/api/system/jobs", "/api/audit")) {
    try { Invoke-RestMethod -Uri "$base$p" -Headers $jobH -TimeoutSec 120 | Out-Null; $leaked += $p }
    catch { }
}
if ($leaked.Count -eq 0) {
    Write-Host "PASS  the scheduler token opens no other route" -ForegroundColor Green
} else {
    Write-Host "FAIL  the scheduler token opened: $($leaked -join ', ')" -ForegroundColor Red; $fail++
}

# 4. Prerequisites, as the app reports them.
$jobs = Invoke-RestMethod -Uri "$base/api/system/jobs" -Headers $adminH -TimeoutSec 180
Write-Host "`n--- /api/system/jobs ---" -ForegroundColor Cyan
"scheduler_token_configured : $($jobs.scheduler_token_configured)"
"appsail_target_id_present  : $($jobs.appsail_target_id_present)"
"jobpool                    : $($jobs.prerequisites.jobpool)"
"scheduler_token            : $($jobs.prerequisites.scheduler_token)"
"digest cron exists         : $($jobs.digest_schedule.exists)"
"sdk_error                  : $($jobs.sdk_error)"
if (($jobs | ConvertTo-Json -Depth 8) -like "*$jobToken*") {
    Write-Host "FAIL  /api/system/jobs echoed the token" -ForegroundColor Red; $fail++
} else {
    Write-Host "PASS  /api/system/jobs does not echo the token" -ForegroundColor Green
}

# 5. Create the cron, if the prerequisite is met.
if ($jobs.jobpools -and $jobs.jobpools.Count -gt 0) {
    Write-Host "`nJobpool present - creating the digest cron..." -ForegroundColor Cyan
    try {
        $c = Invoke-RestMethod -Uri "$base/api/system/jobs/digest" -Method Post -Headers $adminH -TimeoutSec 180
        $c | ConvertTo-Json -Depth 6
    } catch {
        $body = ""
        try {
            $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $body = $sr.ReadToEnd()
        } catch { }
        Write-Host "Cron creation failed. Response body (contains which cron_type the API wanted):" -ForegroundColor Yellow
        $body
        $fail++
    }
} else {
    Write-Host "`nNo jobpool in the project, so the cron cannot be created yet." -ForegroundColor Yellow
    Write-Host "Create one in the Catalyst console under Job Scheduling, then re-run this script." -ForegroundColor Yellow
}

""
if ($fail -eq 0) { Write-Host "Scheduler auth checks all passed." -ForegroundColor Green }
else { Write-Host "$fail check(s) failed." -ForegroundColor Red; exit 1 }
