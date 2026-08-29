# One-command deploy for the KSP Crime AI app to Zoho Catalyst AppSail.
# The AppSail service serves BOTH the React frontend and the FastAPI backend
# from a single origin (no CORS). Run from the project root:  ./deploy.ps1
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads it as ANSI, so a
# UTF-8 em dash decodes to a byte that PowerShell treats as a smart quote, which
# unbalances string literals and breaks parsing.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# --- Config safety check (runs first: fail before doing any work) -----------
# app-config.json carries the AppSail env_variables, including the database
# password and the token signing key. It is gitignored, so it must be created
# locally from app-config.example.json. These checks stop the two failure modes
# that have actually bitten this project: deploying with an ephemeral SQLite
# path (data wiped on restart) and deploying with the old signing key that was
# committed to the public repo (forgeable admin tokens).
$cfgPath = Join-Path $root "app-config.json"
if (-not (Test-Path $cfgPath)) {
    Write-Host "ERROR: app-config.json is missing." -ForegroundColor Red
    Write-Host "Copy app-config.example.json to app-config.json and fill in real values." -ForegroundColor Red
    exit 1
}
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
$dbUrl  = [string]$cfg.env_variables.DATABASE_URL
$secret = [string]$cfg.env_variables.KSP_SECRET_KEY
$seed   = [string]$cfg.env_variables.KSP_AUTOSEED
$bucket = [string]$cfg.env_variables.KSP_STRATUS_BUCKET
$LEAKED_KEY = "ksp-demo-3f9a7c21b64e48d0a1e2c5f7d9b0a4e6"
$fatal = @()

# SQLite is now the supported production backend on AppSail, persisted by
# snapshotting the database file to the Catalyst Stratus object store. So the
# check is no longer "is this SQLite" but "if this is ephemeral SQLite, is the
# snapshot mechanism actually configured". Bare ephemeral SQLite is still fatal:
# it silently loses every write on restart, which was the original bug.
$isSqlite = $dbUrl -like "sqlite*"
$isEphemeral = $isSqlite -and ($dbUrl -match "/tmp/|\\temp\\")

if ($dbUrl -match "PASTE_|REPLACE_|USER:PASSWORD" -or [string]::IsNullOrWhiteSpace($dbUrl)) {
    $fatal += "DATABASE_URL is still a placeholder. Set it to the SQLite path (sqlite:////tmp/ksp_crime_ai.db) or a PostgreSQL connection string."
}
elseif ($isEphemeral -and [string]::IsNullOrWhiteSpace($bucket)) {
    $fatal += "DATABASE_URL is SQLite on an ephemeral path but KSP_STRATUS_BUCKET is not set, so nothing would persist writes across a restart. Set the Stratus bucket name, or point DATABASE_URL at PostgreSQL."
}
elseif ($isSqlite -and -not $isEphemeral) {
    Write-Host "NOTE: DATABASE_URL is SQLite on a non-tmp path. On AppSail the app directory is read-only, so prefer sqlite:////tmp/... with KSP_STRATUS_BUCKET set." -ForegroundColor Yellow
}
elseif (-not $isSqlite -and $dbUrl -notmatch "sslmode=") {
    Write-Host "WARNING: DATABASE_URL has no sslmode - most managed providers need ?sslmode=require." -ForegroundColor Yellow
}

if ($isEphemeral -and $bucket) {
    Write-Host "      persistence: SQLite snapshotted to Stratus bucket '$bucket'." -ForegroundColor DarkGray
}

if ($secret -eq $LEAKED_KEY) {
    $fatal += "KSP_SECRET_KEY is the key that was committed to the public repo. It signs auth tokens, so anyone could forge an admin session. Generate a new one: python -c ""import secrets; print(secrets.token_hex(32))"""
}
elseif ($secret -match "GENERATE_WITH|change-me" -or $secret.Length -lt 32) {
    $fatal += "KSP_SECRET_KEY is a placeholder or too short (needs 32+ chars)."
}

if ($seed -ne "false") {
    $fatal += "KSP_AUTOSEED must be 'false' on a persistent database so real data is never re-seeded (currently '$seed')."
}

if ($fatal.Count -gt 0) {
    Write-Host "`nDeploy blocked - fix these in app-config.json:" -ForegroundColor Red
    $fatal | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}
$dbKind = if ($isEphemeral) { "SQLite + Stratus snapshot" } elseif ($isSqlite) { "SQLite file" } else { "PostgreSQL" }
Write-Host "[0/5] Config check passed ($dbKind, fresh secret, autoseed off)." -ForegroundColor Green

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
    "psycopg2-binary"   = "psycopg2"
    "python-multipart"  = "multipart"
    "scikit-learn"      = "sklearn"
    "zcatalyst-sdk"     = "zcatalyst_sdk"
    "typing-extensions" = "typing_extensions"
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
# The CLI resolves the org and project from its stored login session, not from
# any file in this repo. When the session is missing or expired, 'catalyst
# deploy' fails with "Org and Project Id cannot be empty." which reads like a
# config problem but is really a logged-out CLI. Check first so the message is
# actionable.
$who = (& catalyst whoami 2>&1 | Out-String).Trim()
if ($who -match "not supported in CI") {
    # A leftover CI=true in the environment (a React build sets it to turn
    # warnings into errors) puts the CLI into CI mode, where whoami is refused.
    # Without this branch the failure reads as "not logged in", which is wrong
    # and sends you off running catalyst login for no reason.
    Write-Host "`nDeploy blocked - the CI environment variable is set, which puts the" -ForegroundColor Red
    Write-Host "Catalyst CLI into CI mode and disables the commands used here." -ForegroundColor Red
    Write-Host "Clear it and re-run:" -ForegroundColor Red
    Write-Host '  Remove-Item Env:\CI' -ForegroundColor Yellow
    exit 1
}
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($who) -or $who -notmatch "@") {
    Write-Host "`nDeploy blocked - the Catalyst CLI is not logged in." -ForegroundColor Red
    Write-Host "Run this in your own terminal (it opens a browser and cannot be automated):" -ForegroundColor Red
    Write-Host "  catalyst login" -ForegroundColor Yellow
    Write-Host "Then re-run this script." -ForegroundColor Red
    exit 1
}
Write-Host "      logged in as: $who" -ForegroundColor DarkGray

catalyst deploy
# 'catalyst deploy' returns a non-zero exit code on failure but keeps printing
# to stdout, so without this check the script used to announce a successful
# deploy over the top of a failed one.
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nDEPLOY FAILED (catalyst exit code $LASTEXITCODE). Nothing was published." -ForegroundColor Red
    Write-Host "Read the catalyst output above for the cause. Common ones:" -ForegroundColor Red
    Write-Host "  - 'Org and Project Id cannot be empty'  -> run 'catalyst login', then retry" -ForegroundColor Yellow
    Write-Host "  - a Python import error at boot          -> a dependency is missing from backend/vendor" -ForegroundColor Yellow
    exit 1
}

$baseUrl = "https://ksp-api-50044161264.development.catalystappsail.in"
Write-Host "`nDone. Live at: $baseUrl" -ForegroundColor Green
Write-Host "Verify persistence: GET $baseUrl/api/system/info should report" -ForegroundColor Yellow
if ($isEphemeral) {
    Write-Host '  "database": { "backend": "sqlite", "persistent": true, "autoseed_enabled": false }' -ForegroundColor Yellow
    Write-Host '  "persistence": { "mechanism": "stratus", "bucket": "' -NoNewline -ForegroundColor Yellow
    Write-Host ($bucket + '", "uploads_completed": >0 }') -ForegroundColor Yellow
    Write-Host "Note: uploads_completed stays 0 until the first write lands, so register an FIR first." -ForegroundColor DarkGray
} elseif ($isSqlite) {
    Write-Host '  "database": { "backend": "sqlite", "persistent": true, "autoseed_enabled": false }' -ForegroundColor Yellow
} else {
    Write-Host '  "database": { "backend": "postgresql", "persistent": true, "autoseed_enabled": false }' -ForegroundColor Yellow
}
Write-Host "Also check GET $baseUrl/api/system/services for the live/degraded service map." -ForegroundColor Yellow
