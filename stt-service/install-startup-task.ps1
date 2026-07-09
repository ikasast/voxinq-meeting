# Register Voxinq STT with Task Scheduler (starts at logon; auto-restarts on crash).
# More robust than the startup-folder approach (a shell:startup run-stt-hidden.vbs shortcut):
# if uvicorn crashes, it auto-restarts up to 10 times at 1-minute intervals.
# No admin rights required. In the stt-service directory: .\install-startup-task.ps1
$ErrorActionPreference = 'Stop'

$taskName = 'Voxinq STT'
$vbs = Join-Path $PSScriptRoot 'run-stt-hidden.vbs'
if (-not (Test-Path $vbs)) { throw "run-stt-hidden.vbs not found: $vbs" }

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
# ExecutionTimeLimit zero = no run-time limit (so the default 3 days does not kill it).
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Registered task '$taskName' (starts at logon; on failure restarts up to 10 times at 1-minute intervals)."

# Remove any leftover old-style startup shortcut (prevents double launch).
# The shortcut may point to the vbs directly, or to wscript.exe + arguments.
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
Get-ChildItem $startup -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
    $lnk = $shell.CreateShortcut($_.FullName)
    if ($lnk.TargetPath -ieq $vbs -or $lnk.Arguments -like "*run-stt-hidden.vbs*") {
        Remove-Item $_.FullName -Confirm:$false
        Write-Host "Removed old startup shortcut: $($_.Name)"
    }
}
Write-Host 'To start it now: Start-ScheduledTask -TaskName ''Voxinq STT'''
