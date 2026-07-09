# Register Voxinq Web (Next.js) with Task Scheduler (Windows primary-host operation).
# Launches hidden at logon; if it crashes, the run-web.bat loop self-restarts.
# No admin rights required. In scripts\windows: .\install-web-task.ps1
$ErrorActionPreference = 'Stop'

$taskName = 'Voxinq Web'
$vbs = Join-Path $PSScriptRoot 'run-web-hidden.vbs'
if (-not (Test-Path $vbs)) { throw "run-web-hidden.vbs not found: $vbs" }

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Registered task '$taskName' (starts at logon; self-restarts 15s after a crash)."
Write-Host "To start it now: Start-ScheduledTask -TaskName '$taskName'"
