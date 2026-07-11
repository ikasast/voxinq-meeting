# Voxinq Web update script (Windows primary-host operation; the Windows version of redeploy.sh).
# git pull -> update deps -> apply DB schema -> production build -> restart server.
# Usage: in scripts\windows run .\redeploy-web.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

Write-Host '[1/4] git pull...'
git pull --ff-only

Write-Host '[2/4] update deps & apply DB schema...'
npm install
# Apply pending schema migrations (no-op when up to date).
npx prisma migrate deploy

Write-Host '[3/4] production build...'
npm run build

Write-Host '[4/4] restart server...'
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    # the run-web.bat watch loop auto-restarts with the new build in about 15 seconds
    Stop-Process -Id $conn[0].OwningProcess -Force
} else {
    Start-ScheduledTask -TaskName 'Voxinq Web'
}
Start-Sleep -Seconds 20
$code = (Invoke-WebRequest http://localhost:3000 -UseBasicParsing -TimeoutSec 15).StatusCode
Write-Host "OK: http://localhost:3000 -> $code"
