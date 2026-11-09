@echo off
title Skill Atlas
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

rem If Skill Atlas is already running, just open it in the browser.
netstat -ano | findstr /R /C:":4747 .*LISTENING" >nul
if %errorlevel%==0 (
  start "" http://localhost:4747
  exit /b
)

rem Open the browser after the server has had a moment to start.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:4747"
echo Skill Atlas is running at http://localhost:4747 - close this window to stop it.
node server.js
pause
