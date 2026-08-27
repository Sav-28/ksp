# One-command deploy for the KSP Crime AI app to Zoho Catalyst AppSail.
# The AppSail service serves BOTH the React frontend and the FastAPI backend
# from a single origin (no CORS). Run from the project root:  ./deploy.ps1
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads it as ANSI, so a
# UTF-8 em dash decodes to a byte that PowerShell treats as a smart quote, which
# unbalances string literals and breaks parsing.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "[1/5] Building the React frontend (same-origin)..." -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
npm run build
Pop-Location

Write-Host "[2/5] Copying build into backend/static..." -ForegroundColor Cyan
$static = Join-Path $root "backend/static"
if (Test-Path $static) { Remove-Item -Recurse -Force $static }
Copy-Item -Recurse (Join-Path $root "frontend/build") $static

# --- Vendoring -------------------------------------------------------------
# AppSail does NOT pip-install on the server, so Linux wheels are vendored into
# backend/vendor before deploy. The check below is keyed on a HASH of
# requirements.txt: if a dependency is added or changed, vendoring re-runs
# automatically. Previously it only checked that vendor/fastapi existed, so a
# newly added dependency (the psycopg2 PostgreSQL driver) was silently left out
# and the deployed app failed at runtime.
Write-Host "[3/5] Checking vendored Linux dependencies..." -ForegroundColor Cyan
$backend   = Join-Path $root "backend"
$vendor    = Join-Path $backend "vendor"
$reqFile   = Join-Path $backend "requirements.txt"
$stampFile = Join-Path $vendor  ".requirements.sha256"

$reqHash = (Get-FileHash $reqFile -Algorithm SHA256).Hash
$needsVendor = $true
if ((Test-Path $vendor) -and (Test-Path $stampFile)) {
    if ((Get-Content $stampFile -Raw).Trim() -eq $reqHash) {
        $needsVendor = $false
    } else {
        Write-Host "      requirements.txt changed since vendoring - refreshing." -ForegroundColor Yellow
    }
} elseif (Test-Path $vendor) {
    Write-Host "      vendor/ has no stamp - refreshing to be safe." -ForegroundColor Yellow
}

if ($needsVendor) {
    Push-Location $backend
    powershell -ExecutionPolicy Bypass -File .\vendor-deps.ps1
    Pop-Location
    Set-Content -Path $stampFile -Value $reqHash
} else {
    Write-Host "      vendor/ is up to date with requirements.txt." -ForegroundColor DarkGray
}

# Fail fast if anything in requirements.txt did not make it into vendor/.
Write-Host "[4/5] Verifying every dependency is vendored..." -ForegroundColor Cyan
# Import name differs from the distribution name for some packages.
$importNames = @{
    "psycopg2-binary"  = "psycopg2"
    "python-multipart" = "multipart"
    "scikit-learn"     = "sklearn"
}
$missing = @()
foreach ($line in Get-Content $reqFile) {
    $l = $line.Trim()
    if ($l -eq "" -or $l.StartsWith("#")) { continue }
    $dist = ($l -split "[=<>!\[]")[0].Trim()
    $name = if ($importNames.ContainsKey($dist)) { $importNames[$dist] } else { $dist.Replace("-", "_") }
    $hit = Get-ChildItem $vendor -Force | Where-Object {
        $_.Name -eq $name -or $_.Name -eq "$name.py" -or $_.Name -like "$name-*" -or $_.Name -like "$name.*"
    }
    if (-not $hit) { $missing += "$dist (expected '$name')" }
}
if ($missing.Count -gt 0) {
    Write-Host "`nERROR: these dependencies are missing from vendor/:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "Deploying now would fail at runtime. Delete backend/vendor and re-run." -ForegroundColor Red
    exit 1
}
Write-Host "      all dependencies present." -ForegroundColor DarkGray

Write-Host "[5/5] Deploying to Catalyst AppSail..." -ForegroundColor Cyan
catalyst deploy

Write-Host "`nDone. Live at: https://ksp-api-50044161264.development.catalystappsail.in" -ForegroundColor Green
Write-Host "Verify persistence: GET /api/system/info should report" -ForegroundColor Yellow
Write-Host '  "backend": "postgresql", "persistent": true, "autoseed_enabled": false' -ForegroundColor Yellow
