@echo off
REM ---------------------------------------------------------------------------
REM  Codeling - run from source on Windows.
REM
REM  Double-click this file. It installs dependencies the first time and then
REM  opens the app. You need Node.js 20 or newer: https://nodejs.org
REM
REM  To build an installer instead, run:  npm run dist:win
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found.
  echo   Install it from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo   First run - installing dependencies. This takes a minute or two.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo   Starting Codeling...
echo.
call npm run dev
endlocal
