@echo off
setlocal
cd /d "%~dp0"
title Studio Kinematics ORYN

echo ============================================================
echo   Studio Kinematics ORYN - Motion v3.0
echo ============================================================

set "PYEXE="
where py >nul 2>nul && set "PYEXE=py -3"
if not defined PYEXE (
  where python >nul 2>nul && set "PYEXE=python"
)
if not defined PYEXE (
  echo Python not found. Install Python 3.12+ and try again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js/npm not found. Install current Node.js LTS and try again.
  pause
  exit /b 1
)

if not exist .venv\Scripts\python.exe (
  echo [1/4] Creating Python environment...
  %PYEXE% -m venv .venv
)

echo [2/4] Installing backend requirements...
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements-nonrpi.txt
if errorlevel 1 goto :fail

if not exist frontend\node_modules (
  echo [3/4] Installing frontend packages...
  pushd frontend
  call npm ci
  if errorlevel 1 (popd & goto :fail)
  popd
) else (
  echo [3/4] Frontend packages ready.
)

echo [4/4] Starting backend and frontend...
start "ORYN Backend" cmd /k "cd /d %~dp0 && .venv\Scripts\python.exe main.py"
start "ORYN Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 4 /nobreak >nul
start "" http://127.0.0.1:5173
exit /b 0

:fail
echo.
echo Installation/startup failed. Keep this window open and send the error text.
pause
exit /b 1
