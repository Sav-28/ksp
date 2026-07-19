# One-command deploy for the KSP Crime AI app to Zoho Catalyst AppSail.
# The AppSail service serves BOTH the React frontend and the FastAPI backend
# from a single origin (no CORS). Run from the project root:  ./deploy.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "[1/4] Building the React frontend (same-origin)..." -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
npm run build
Pop-Location

Write-Host "[2/4] Copying build into backend/static..." -ForegroundColor Cyan
$static = Join-Path $root "backend/static"
if (Test-Path $static) { Remove-Item -Recurse -Force $static }
Copy-Item -Recurse (Join-Path $root "frontend/build") $static

Write-Host "[3/4] Ensuring Linux dependencies are vendored..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $root "backend/vendor/fastapi"))) {
    Push-Location (Join-Path $root "backend")
    powershell -ExecutionPolicy Bypass -File .\vendor-deps.ps1
    Pop-Location
} else {
    Write-Host "      vendor/ already present (delete it to refresh)." -ForegroundColor DarkGray
}

Write-Host "[4/4] Deploying to Catalyst AppSail..." -ForegroundColor Cyan
catalyst deploy

Write-Host "`nDone. Live at: https://ksp-api-50044161264.development.catalystappsail.in" -ForegroundColor Green
