@echo off
setlocal EnableExtensions
title Build ORYN-Setup-FINAL.exe
cd /d "%~dp0"

echo ============================================================
echo   ORYN FINAL - Windows Release Builder
echo   Designed to Move
echo   by Studio Kinematics
echo ============================================================
echo.
echo This script BUILDS the professional Windows installer.
echo The finished customer's PC does NOT need Python, Node, or Git.
echo.

where py >nul 2>nul
if %ERRORLEVEL%==0 (
    set "PY=py"
) else (
    where python >nul 2>nul
    if %ERRORLEVEL%==0 (
        set "PY=python"
    ) else (
        echo [ERROR] Python 3.11 or 3.12 is required on this BUILD PC.
        echo Download: https://www.python.org/downloads/windows/
        pause
        exit /b 1
    )
)

set "ISCC="
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"

if not defined ISCC (
    echo [ERROR] Inno Setup 6 is required on this BUILD PC.
    echo Download: https://jrsoftware.org/isdl.php
    echo Install it, then run this file again.
    pause
    exit /b 1
)

echo [1/6] Preparing build environment...
if not exist ".build-venv\Scripts\python.exe" (
    %PY% -m venv .build-venv
    if errorlevel 1 goto :fail
)

set "BPY=.build-venv\Scripts\python.exe"

echo [2/6] Installing build tools...
"%BPY%" -m pip install --upgrade pip setuptools wheel
if errorlevel 1 goto :fail
"%BPY%" -m pip install -r requirements-nonrpi.txt
if errorlevel 1 goto :fail
"%BPY%" -m pip install "pyinstaller>=6.10,<7"
if errorlevel 1 goto :fail

echo [3/6] Cleaning previous build...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist release rmdir /s /q release
mkdir release

echo [4/6] Building standalone ORYN application...
"%BPY%" -m PyInstaller --noconfirm --clean packaging\windows\ORYN.spec
if errorlevel 1 goto :fail

if not exist "dist\ORYN\ORYN.exe" (
    echo [ERROR] PyInstaller did not create dist\ORYN\ORYN.exe
    goto :fail
)

copy /Y "packaging\windows\ORYN-Diagnostics.bat" "dist\ORYN\ORYN-Diagnostics.bat" >nul

echo [5/6] Building ORYN installer...
"%ISCC%" packaging\windows\ORYN.iss
if errorlevel 1 goto :fail

if not exist "release\ORYN-Setup-FINAL.exe" (
    echo [ERROR] Inno Setup did not create release\ORYN-Setup-FINAL.exe
    goto :fail
)

echo [6/6] Complete.
echo.
echo ============================================================
echo   FINAL INSTALLER:
echo   %CD%\release\ORYN-Setup-FINAL.exe
echo ============================================================
echo.
echo Test this EXE on another Windows 10/11 PC before publishing.
echo Then upload it to GitHub Releases.
echo.
start "" explorer "%CD%\release"
pause
exit /b 0

:fail
echo.
echo ============================================================
echo   BUILD FAILED
echo ============================================================
echo Read the error above. No working ORYN source files were modified.
pause
exit /b 1
