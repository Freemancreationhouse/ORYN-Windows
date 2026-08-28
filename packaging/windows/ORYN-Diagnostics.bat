@echo off
setlocal
title ORYN Diagnostics
cd /d "%~dp0"

echo ============================================================
echo   ORYN Diagnostics
echo ============================================================
echo.

echo Application folder:
echo   %CD%
echo.

echo Checking required folders...
if exist "static\dist\index.html" (echo [OK] static\dist\index.html) else (echo [MISSING] static\dist\index.html)
if exist "patterns" (echo [OK] patterns) else (echo [MISSING] patterns)
if exist "ORYN.exe" (echo [OK] ORYN.exe) else (echo [MISSING] ORYN.exe)

echo.
echo Startup log:
echo   %LOCALAPPDATA%\ORYN\startup.log
echo.
echo Startup error log:
echo   %LOCALAPPDATA%\ORYN\startup-error.log
echo.

if exist "%LOCALAPPDATA%\ORYN\startup-error.log" (
    echo -------------------- ERROR LOG ---------------------------
    type "%LOCALAPPDATA%\ORYN\startup-error.log"
    echo ----------------------------------------------------------
) else (
    echo No startup-error.log exists yet.
)

echo.
pause
