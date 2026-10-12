@echo off
rem QC-LAUNCHER: 20261012-0700
rem Quiz Corner - double-click to start.
rem Laptop: control window.  TV (HDMI, Windows+P = Extend): the stage, full screen.  No TV: laptop only (practice).
rem Always opens the quiz file with the NEWEST build stamp (also one in Downloads, Desktop, Documents or WhatsApp),
rem never by file date.  Copies that arrived as "... (1).bat / (1).ps1" are handled: the newest launcher runs.
setlocal
title Quiz Corner - starting...
cd /d "%~dp0"
set "QC_HERE=%~dp0"
set "QC_BAT=%~f0"
echo.
echo  QUIZ CORNER - starting from this folder:
echo    "%~dp0"
echo.

rem Started from inside the ZIP? Windows then gives only this one file - the others are missing.
echo "%~dp0" | find /i ".zip" >nul && goto inzip

rem the newest launcher script in this folder (by its QC-LAUNCHER stamp)
set "PS1="
set "PS1S="
for %%F in ("%~dp0QuizCorner_Launcher*.ps1") do call :best "%%~fF" QC-LAUNCHER PS1
if not defined PS1 goto missing
echo  Launcher : "%PS1%"  [%PS1S%]
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%PS1%"
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
rem Without the launcher: open the quiz file of this folder with the NEWEST build stamp in Chrome (else Edge),
rem control + stage, in the same browser profile the launcher uses (so the saved event is the same).
set "QH="
set "QHS="
for %%F in ("%~dp0*.html") do call :quizfile "%%~fF"
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
echo    "%QH%"
echo    build %QHS%
echo.
if not defined BR goto nobrowser
set "QU=%QH:\=/%"
start "" "%BR%" --user-data-dir="%LOCALAPPDATA%\QuizCorner\BrowserProfile" --no-first-run --autoplay-policy=no-user-gesture-required --app="file:///%QU%" --start-maximized
timeout /t 3 /nobreak >nul
start "" "%BR%" --user-data-dir="%LOCALAPPDATA%\QuizCorner\BrowserProfile" --no-first-run --autoplay-policy=no-user-gesture-required --app="file:///%QU%#stage" --new-window
goto manual
:nobrowser
start "" "%QH%"
:manual
echo    1. Press Windows+P and choose "Extend".
echo    2. Click the "Quiz Corner - STAGE" window and press Windows+Shift+Right arrow (it moves to the TV).
echo    3. Double-click the TV picture for full screen.
echo    (If the stage window is not there: press O in the control window.)
echo  (A log is in %LOCALAPPDATA%\QuizCorner\launcher_log.txt)
echo.
pause
exit /b 0

:quizfile
rem %1 = an .html file of this folder; the LITE copy is skipped
echo "%~n1" | find /i "LITE" >nul && exit /b 0
call :best %1 QC-BUILD QH
exit /b 0

:best
rem %1 = file, %2 = stamp name, %3 = result variable: keeps in %3 the file with the highest stamp so far (its stamp in %3S)
set "ST="
for /f "tokens=3 delims=: " %%B in ('findstr /b /c:"rem %~2:" /c:"# %~2:" /c:"<!-- %~2:" "%~1" 2^>nul') do if not defined ST set "ST=%%B"
if not defined ST set "ST=00000000-0000"
call set "CUR=%%%~3S%%"
if "%ST%" GTR "%CUR%" (
  set "%~3=%~1"
  set "%~3S=%ST%"
)
exit /b 0
