' Launch the Voxinq web server in a hidden window.
' Used by the "Voxinq Web" scheduled task (see install-web-task.ps1).
' Waits for run-web.bat and propagates its exit code.
' NOTE: Keep this file ASCII-only. WScript reads .vbs as ANSI (CP932 on
' Japanese Windows), so UTF-8 Japanese comments get misparsed and break
' the script.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
rc = sh.Run("""" & dir & "\run-web.bat""", 0, True)
WScript.Quit rc
