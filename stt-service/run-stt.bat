@echo off
REM Voxinq STT service launcher (for running resident on Windows).
REM Run from startup registration or Task Scheduler (install-startup-task.ps1).
REM Output is appended to stt.log (viewable later even when launched hidden).
REM If uvicorn crashes, it keeps auto-restarting after 15 seconds (resident self-recovery).
REM To stop completely: Stop-ScheduledTask -TaskName 'Voxinq STT'
cd /d "%~dp0"
if "%STT_PORT%"=="" set STT_PORT=8000
call ".venv\Scripts\activate.bat"
:loop
echo [%date% %time%] starting uvicorn on port %STT_PORT% >> "%~dp0stt.log"
python -m uvicorn server:app --host 0.0.0.0 --port %STT_PORT% >> "%~dp0stt.log" 2>&1
echo [%date% %time%] uvicorn exited with code %errorlevel%, restarting in 15 seconds >> "%~dp0stt.log"
timeout /t 15 /nobreak > nul
goto loop
