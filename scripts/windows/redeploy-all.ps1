# Voxinq full redeploy (Windows primary host): web + STT together.
#
# redeploy-web.ps1 only rebuilds/restarts the WEB app. Any change under stt-service/
# (server.py etc.) also needs the STT service restarted — this script does both, so a
# `git pull` that touched STT is fully applied in one step.
#
# Usage: in scripts\windows run  .\redeploy-all.ps1
#        .\redeploy-all.ps1 -Branch <name>   deploy a branch other than release
param([string]$Branch = 'release')
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

Write-Host '===== [1/2] Web redeploy (pull, deps, migrate, build, restart) =====' -ForegroundColor Cyan
& (Join-Path $here 'redeploy-web.ps1') -Branch $Branch

Write-Host ''
Write-Host '===== [2/2] STT restart =====' -ForegroundColor Cyan
# The web redeploy already ran `git pull`, so stt-service/ is up to date on disk. Restart the
# STT process so uvicorn reloads the new server.py.
$conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    # run-stt.bat is a watch loop: killing uvicorn makes it relaunch with the new code (~15s).
    Stop-Process -Id $conn[0].OwningProcess -Force
    Write-Host 'STT stopped; run-stt.bat will relaunch it with the new code.'
} else {
    Start-ScheduledTask -TaskName 'Voxinq STT'
    Write-Host 'STT was not listening; started the "Voxinq STT" task.'
}

Write-Host 'Waiting for STT to come back...'
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $code = (Invoke-WebRequest 'http://localhost:8000/health' -UseBasicParsing -TimeoutSec 5).StatusCode
        if ($code -eq 200) { $ok = $true; break }
    } catch {
        # not up yet
    }
}
if ($ok) {
    Write-Host 'OK: STT /health -> 200' -ForegroundColor Green
} else {
    Write-Warning 'STT did not respond within ~60s. Check stt-service\stt.log and the "Voxinq STT" task.'
}

Write-Host ''
Write-Host 'Full redeploy done (web + STT).' -ForegroundColor Green
