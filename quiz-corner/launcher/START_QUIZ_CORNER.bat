@echo off
rem Quiz Corner - double-click to start.
rem Laptop: control window.  TV (HDMI, Windows+P = Extend): the stage, full screen.  No TV: laptop only (practice).
title Quiz Corner - starting...
cd /d "%~dp0"

rem Started from inside the ZIP? Windows then gives only this one file - the others are missing.
echo "%~dp0" | find /i ".zip" >nul && goto inzip
if not exist "%~dp0QuizCorner_Launcher.ps1" goto missing
if not exist "%~dp0Quiz_Corner*.html" goto missing

powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0QuizCorner_Launcher.ps1"
if errorlevel 1 goto fallback
exit /b 0

:inzip
echo.
echo  You started this from INSIDE the ZIP file.
echo  Right-click the ZIP  ^>  "Extract All..."  ^>  open the new folder  ^>  double-click START_QUIZ_CORNER.bat there.
echo.
pause
exit /b 1

:missing
echo.
echo  Keep these three files together in ONE folder:
echo     START_QUIZ_CORNER.bat
echo     QuizCorner_Launcher.ps1
echo     Quiz_Corner_V66_FINAL_Broadcast_Engine.html
echo.
if exist "%~dp0Quiz_Corner*.html" goto fallback
pause
exit /b 1

:fallback
echo.
echo  The automatic start did not finish. Opening the quiz in the normal way...
echo    1. Press Windows+P and choose "Extend".
echo    2. In the quiz press O - the stage window opens.
echo    3. Drag it to the TV (or click it and press Windows+Shift+Right arrow).
echo    4. Double-click the TV picture for full screen.
echo  (A log is in %LOCALAPPDATA%\QuizCorner\launcher_log.txt)
echo.
for %%F in ("%~dp0Quiz_Corner*Broadcast_Engine*.html") do (start "" "%%~fF" & goto done)
for %%F in ("%~dp0Quiz_Corner*.html") do (start "" "%%~fF" & goto done)
:done
pause
