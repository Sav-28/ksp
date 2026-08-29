$ErrorActionPreference = "Stop"
$base = "https://ksp-api-50044161264.development.catalystappsail.in"
$login = Invoke-RestMethod -Uri "$base/api/login" -Method Post `
    -Body (@{ username = "investigator"; password = "invest@2024" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 120
$h = @{ Authorization = "Bearer $($login.token)" }
$p = Invoke-RestMethod -Uri "$base/api/system/catalyst-probe" -Headers $h -TimeoutSec 120
$p | ConvertTo-Json -Depth 8
