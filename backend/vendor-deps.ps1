# Vendors Linux (manylinux) wheels for the backend into ./vendor so they ship
# with the app on Zoho Catalyst AppSail (which does NOT pip-install on the server).
#
# Usage (from the backend folder):
#   ./vendor-deps.ps1                 # default: Python 3.11, x86_64
#   ./vendor-deps.ps1 -Abi cp312      # if you chose the Python 3.12 stack
#   ./vendor-deps.ps1 -Arch aarch64   # if your AppSail region is ARM
param(
    [string]$Abi = "cp311",
    [string]$PyVersion = "3.11",
    [ValidateSet("x86_64", "aarch64")]
    [string]$Arch = "x86_64"
)

$ErrorActionPreference = "Stop"
$target   = Join-Path $PSScriptRoot "vendor"
$platform = "manylinux2014_$Arch"

Write-Host "Cleaning $target ..." -ForegroundColor Cyan
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
New-Item -ItemType Directory -Path $target | Out-Null

Write-Host "Downloading Linux wheels ($platform, $Abi) into ./vendor ..." -ForegroundColor Cyan
pip install -r (Join-Path $PSScriptRoot "requirements.txt") `
    --target $target `
    --only-binary=:all: `
    --platform $platform `
    --python-version $PyVersion `
    --implementation cp `
    --abi $Abi

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nVendoring FAILED. If a wheel wasn't found, try -Arch aarch64 (ARM region)." -ForegroundColor Red
    exit 1
}

Write-Host "`nDone. ./vendor is ready. Now run:  catalyst deploy" -ForegroundColor Green
