# Registers the "Voxinq Backup" Task Scheduler task: nightly pg_dump at 03:00
# (runs as soon as possible if the machine was off at 03:00).
# Usage: .\scripts\windows\install-backup-task.ps1
$ErrorActionPreference = "Stop"

$script = Join-Path $PSScriptRoot "backup-db.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At 3:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName "Voxinq Backup" -Action $action -Trigger $trigger `
  -Settings $settings -Description "Nightly Voxinq PostgreSQL backup (pg_dump + rotation)" -Force

Write-Host "Registered task 'Voxinq Backup' (daily 03:00, catch-up on boot)."
Write-Host "Run once now to verify:  Start-ScheduledTask -TaskName 'Voxinq Backup'"
