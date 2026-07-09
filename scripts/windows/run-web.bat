@echo off
REM Voxinq Web (Next.js) resident script (Windows primary-host operation).
REM Run from Task Scheduler via run-web-hidden.vbs.
REM If the server crashes, it keeps auto-restarting after 15 seconds.
REM To stop completely: Stop-ScheduledTask -TaskName 'Voxinq Web'
cd /d "%~dp0..\.."
:loop
echo [%date% %time%] starting next server >> "%~dp0web.log"
call npm run start >> "%~dp0web.log" 2>&1
echo [%date% %time%] next server exited with code %errorlevel%, restarting in 15 seconds >> "%~dp0web.log"
timeout /t 15 /nobreak > nul
goto loop
