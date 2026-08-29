# Checks the KSP_JOB_TOKEN branch of deploy.ps1's config guard.
#
# Runs deploy.ps1 in a TEMPORARY COPY of the whole project layout it needs. The
# real app-config.json is never moved, renamed or written - an earlier harness in
# this project did exactly that and destroyed the signing key when it was
# interrupted. Nothing here touches the working tree.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$real = Get-Content (Join-Path $root "app-config.json") -Raw | ConvertFrom-Json
$goodSecret = [string]$real.env_variables.KSP_SECRET_KEY

$cases = @(
    @{ name = "empty token (scheduled digest disabled)"; token = ""; expectBlock = $false },
    @{ name = "absent token key";                        token = $null; expectBlock = $false },
    @{ name = "31-char token (one short)";               token = ("a" * 31); expectBlock = $true },
    @{ name = "32-char token (minimum)";                 token = ("a" * 32); expectBlock = $false },
    @{ name = "placeholder token";                       token = "GENERATE_WITH: python -c ..."; expectBlock = $true },
    @{ name = "token reusing KSP_SECRET_KEY";            token = $goodSecret; expectBlock = $true }
)

$pass = 0; $fail = 0
foreach ($c in $cases) {
    $sandbox = Join-Path $env:TEMP ("ksp-guard-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Path $sandbox | Out-Null
    try {
        # Only the config check runs before the first real work, so the guard can
        # be exercised with just deploy.ps1 and a config file present.
        Copy-Item (Join-Path $root "deploy.ps1") $sandbox

        $cfg = Get-Content (Join-Path $root "app-config.json") -Raw | ConvertFrom-Json
        if ($null -eq $c.token) {
            $cfg.env_variables.PSObject.Properties.Remove("KSP_JOB_TOKEN")
        } else {
            $cfg.env_variables | Add-Member -NotePropertyName KSP_JOB_TOKEN -NotePropertyValue $c.token -Force
        }
        $cfg | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $sandbox "app-config.json")

        # Capture to a file rather than piping through 2>&1: the sandbox has no
        # frontend, so deploy.ps1 fails at its build step, and under
        # ErrorActionPreference=Stop those stderr lines would abort this harness
        # before it could report anything.
        $logPath = Join-Path $sandbox "out.txt"
        $prev = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & powershell -ExecutionPolicy Bypass -File (Join-Path $sandbox "deploy.ps1") *> $logPath
        $ErrorActionPreference = $prev
        $out = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
        if ($null -eq $out) { $out = "" }
        $blocked = $out -match "Deploy blocked"
        # Everything past the config check fails in the sandbox (no frontend), which
        # is fine: we only care whether the guard fired.
        $tokenMentioned = $out -match "KSP_JOB_TOKEN"

        if ($blocked -eq $c.expectBlock -and ((-not $c.expectBlock) -or $tokenMentioned)) {
            "PASS  {0}" -f $c.name; $pass++
        } else {
            "FAIL  {0}  (blocked=$blocked expected=$($c.expectBlock) tokenNamed=$tokenMentioned)" -f $c.name
            $fail++
        }
    } finally {
        Remove-Item -Recurse -Force $sandbox -ErrorAction SilentlyContinue
    }
}

""
if ($fail -eq 0) { Write-Host "All $pass guard cases behaved correctly." -ForegroundColor Green }
else { Write-Host "$fail of $($pass + $fail) guard cases wrong." -ForegroundColor Red; exit 1 }
