@echo off
rem Quiz Corner - double-click to start.
rem Laptop: control window.  TV (HDMI, Windows+P = Extend): the stage, full screen.  No TV: laptop only (practice).
rem The launcher always opens the NEWEST quiz file (also a new download in Downloads, Desktop, Documents or WhatsApp).
title Quiz Corner - starting...
cd /d "%~dp0"
echo.
echo  QUIZ CORNER - starting from this folder:
echo    %~dp0
echo.

rem Started from inside the ZIP? Windows then gives only this one file - the others are missing.
echo "%~dp0" | find /i ".zip" >nul && goto inzip
if not exist "%~dp0QuizCorner_Launcher.ps1" goto missing

powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0QuizCorner_Launcher.ps1"
if errorlevel 1 goto fallback
exit /b 0

:inzip
echo  You started this from INSIDE the ZIP file.
echo  Right-click the ZIP  ^>  "Extract All..."  ^>  open the new folder  ^>  double-click START_QUIZ_CORNER.bat there.
echo.
pause
exit /b 1

:missing
echo  QuizCorner_Launcher.ps1 is missing. Keep these three files together in ONE folder:
echo     START_QUIZ_CORNER.bat
echo     QuizCorner_Launcher.ps1
echo     Quiz_Corner_V66_FINAL_Broadcast_Engine.html
echo.
goto fallback

:fallback
rem Without the launcher: open the newest quiz file of this folder in Chrome (else Edge), control + stage,
rem in the same browser profile the launcher uses (so the saved event is the same).
set "QH="
for /f "delims=" %%F in ('dir /b /a-d /o-d "%~dp0*.html" 2^>nul ^| findstr /i /v "LITE"') do if not defined QH set "QH=%~dp0%%F"
if not defined QH (
  echo  No quiz HTML file in this folder. Put Quiz_Corner_V66_FINAL_Broadcast_Engine.html next to this file.
  pause
  exit /b 1
)
set "BR="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BR=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BR if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BR=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BR if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BR=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined BR if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BR=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BR if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BR=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
echo  The automatic start did not finish. Opening the newest quiz file directly:
echo    %QH%
echo.
if not defined BR (
  start "" "%QH%"
  goto manual
)
set "QU=%QH:\=/%"
start "" "%BR%" --user-data-dir="%LOCALAPPDATA%\QuizCorner\BrowserProfile" --no-first-run --autoplay-policy=no-user-gesture-required --app="file:///%QU%" --start-maximized
timeout /t 3 /nobreak >nul
start "" "%BR%" --user-data-dir="%LOCALAPPDATA%\QuizCorner\BrowserProfile" --no-first-run --autoplay-policy=no-user-gesture-required --app="file:///%QU%#stage" --new-window
:manual
echo    1. Press Windows+P and choose "Extend".
echo    2. Click the "Quiz Corner - STAGE" window and press Windows+Shift+Right arrow (it moves to the TV).
echo    3. Double-click the TV picture for full screen.
echo    (If the stage window is not there: press O in the control window.)
echo  (A log is in %LOCALAPPDATA%\QuizCorner\launcher_log.txt)
echo.
pause
