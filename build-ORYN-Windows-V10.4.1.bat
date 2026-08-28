@echo off
setlocal EnableExtensions
title Build ORYN Windows Setup V10.4.1
cd /d "%~dp0"

echo ============================================================
echo   ORYN V10.4.1 - Professional Windows Installer Builder
echo   Designed to Move - by Studio Kinematics
echo ============================================================
echo.
echo This only packages the locked ORYN source.
echo Customer PCs do NOT need Python, Node.js, Git, or VS Code.
echo.

where py >nul 2>nul
if %ERRORLEVEL%==0 (
    set "PY=py -3.12"
) else (
    where python >nul 2>nul
    if %ERRORLEVEL%==0 (
        set "PY=python"
    ) else (
        echo [ERROR] Python 3.12 x64 is required on this BUILD PC.
        pause
        exit /b 1
    )
)

set "ISCC="
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not defined ISCC (
    echo [ERROR] Inno Setup 6 is required on this BUILD PC.
    echo Install Inno Setup 6, then run this builder again.
    pause
    exit /b 1
)

echo [1/6] Preparing isolated build environment...
if not exist ".build-venv\Scripts\python.exe" (
    %PY% -m venv .build-venv
    if errorlevel 1 goto :fail
)
set "BPY=.build-venv\Scripts\python.exe"

echo [2/6] Installing packaging dependencies...
"%BPY%" -m pip install --upgrade pip setuptools wheel
if errorlevel 1 goto :fail
"%BPY%" -m pip install -r requirements-nonrpi.txt
if errorlevel 1 goto :fail
"%BPY%" -m pip install "pyinstaller>=6.10,<7"
if errorlevel 1 goto :fail

echo [3/6] Cleaning old build outputs...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist release rmdir /s /q release
mkdir release

echo [4/6] Packaging locked ORYN application...
"%BPY%" -m PyInstaller --noconfirm --clean packaging\windows_v10_4_1\ORYN-V10.4.1.spec
if errorlevel 1 goto :fail
if not exist "dist\ORYN\ORYN.exe" (
    echo [ERROR] PyInstaller did not create dist\ORYN\ORYN.exe
    goto :fail
)
copy /Y "packaging\windows\ORYN-Diagnostics.bat" "dist\ORYN\ORYN-Diagnostics.bat" >nul

echo [5/6] Creating customer installer...
"%ISCC%" packaging\windows_v10_4_1\ORYN-V10.4.1.iss
if errorlevel 1 goto :fail
if not exist "release\ORYN-Windows-Setup-V10.4.1.exe" (
    echo [ERROR] Installer was not created.
    goto :fail
)

echo [6/6] Creating SHA-256 checksum...
certutil -hashfile "release\ORYN-Windows-Setup-V10.4.1.exe" SHA256 > "release\ORYN-Windows-Setup-V10.4.1.exe.sha256.txt"

echo.
echo ============================================================
echo   BUILD COMPLETE
echo   release\ORYN-Windows-Setup-V10.4.1.exe
echo ============================================================
echo.
echo Test the installer on a clean Windows 10/11 x64 PC before publishing.
start "" explorer "%CD%\release"
pause
exit /b 0

:fail
echo.
echo ============================================================
echo   BUILD FAILED - locked application source was not modified.
echo ============================================================
pause
exit /b 1
