# Register a task to start native PostgreSQL (zip binary build) at logon.
# pg_ctl daemonizes the server and returns immediately, so the task completes after startup.
# No admin rights required. e.g.: .\install-db-task.ps1 -PgBin C:\Users\you\pgsql\bin -DataDir C:\Users\you\voxinq-pgdata
param(
    [string]$PgBin = "$env:USERPROFILE\pgsql\bin",
    [string]$DataDir = "$env:USERPROFILE\voxinq-pgdata"
)
$ErrorActionPreference = 'Stop'

$pgctl = Join-Path $PgBin 'pg_ctl.exe'
if (-not (Test-Path $pgctl)) { throw "pg_ctl.exe not found: $pgctl" }
if (-not (Test-Path $DataDir)) { throw "Data directory missing (check that initdb ran): $DataDir" }

# Generate a hidden-launch VBS inside the data directory (ASCII only; shows no console).
$vbs = Join-Path $DataDir 'start-db-hidden.vbs'
@"
Set sh = CreateObject("WScript.Shell")
sh.Run """$pgctl"" start -D ""$DataDir"" -w -l ""$DataDir\pg.log""", 0, True
"@ | Set-Content -Path $vbs -Encoding ascii

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName 'Voxinq DB' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Registered task 'Voxinq DB' (starts PostgreSQL at logon)."
