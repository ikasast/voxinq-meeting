# Voxinq Web update script (Windows primary-host operation; the Windows version of redeploy.sh).
# git pull -> update deps -> apply DB schema -> production build -> restart server.
# Usage: in scripts\windows run .\redeploy-web.ps1
#        .\redeploy-web.ps1 -Branch <name>   deploy a branch other than release (e.g. to test a PR)
#
# Production tracks `release` (the latest tagged version); `main` is where development lands.
# See docs/setup.md "Branches & releases".
#
# Nothing touches the running server until the new build exists. $ErrorActionPreference does
# NOT stop on a non-zero exit from a native command, so every step below checks $LASTEXITCODE
# explicitly — without that a failed build fell through to the restart, which stopped the
# server it could not then start. (redeploy.sh gets this from `set -e`; this is the Windows
# equivalent.)
param([string]$Branch = 'release')
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

function Invoke-Step {
    param([string]$Label, [scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed (exit $LASTEXITCODE). The running site is untouched — fix the error above and re-run."
    }
}

# This builds whatever is checked out. A leftover feature branch would otherwise deploy
# silently — the site looks stale and nothing reports an error — so require it explicitly.
$current = (git rev-parse --abbrev-ref HEAD).Trim()
if ($current -ne $Branch) {
    throw "On branch '$current' but deploying '$Branch'. Run 'git checkout $Branch' first, or pass -Branch $current to deploy this branch on purpose."
}
Write-Host "[1/4] git pull ($current)..."
Invoke-Step 'git pull' { git pull --ff-only }

Write-Host '[2/4] update deps & apply DB schema...'
Invoke-Step 'npm install' { npm install }
# Apply pending schema migrations (no-op when up to date).
Invoke-Step 'prisma migrate deploy' { npx prisma migrate deploy }

Write-Host '[3/4] production build...'
Invoke-Step 'npm run build' { npm run build }
# A build can also fail in ways that still exit 0. `next start` cannot run without BUILD_ID,
# so check for it here rather than discovering it after the server has been stopped.
if (-not (Test-Path '.next\BUILD_ID')) {
    throw "Build produced no .next\BUILD_ID. The running site is untouched — investigate before retrying."
}

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
