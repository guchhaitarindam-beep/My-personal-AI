@echo off
rem Quiz Corner - double-click to start.
rem Laptop: control window.  TV (HDMI): the stage, full screen.  No TV: laptop only (preparation).
title Quiz Corner - starting...
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0QuizCorner_Launcher.ps1"
if errorlevel 1 goto fallback
exit /b 0

:fallback
echo.
echo  The automatic start did not finish. Opening the quiz in the normal way...
echo  In the quiz: press O to open the stage window, drag it to the TV,
echo  then double-click it for full screen.
echo.
for %%F in ("%~dp0Quiz_Corner*Broadcast_Engine*.html") do (start "" "%%~fF" & goto done)
for %%F in ("%~dp0Quiz_Corner*.html") do (start "" "%%~fF" & goto done)
:done
pause
