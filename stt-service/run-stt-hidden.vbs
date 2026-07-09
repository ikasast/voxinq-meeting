' Launch the Voxinq STT service in a hidden window.
' Used by the "Voxinq STT" scheduled task (see install-startup-task.ps1),
' or via a shortcut in shell:startup.
' Waits for run-stt.bat and propagates its exit code so Task Scheduler can
' detect a crash and restart the service.
' NOTE: Keep this file ASCII-only. WScript reads .vbs as ANSI (CP932 on
' Japanese Windows), so UTF-8 Japanese comments get misparsed and break the
' script ("Object required" errors).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
rc = sh.Run("""" & dir & "\run-stt.bat""", 0, True)
WScript.Quit rc
