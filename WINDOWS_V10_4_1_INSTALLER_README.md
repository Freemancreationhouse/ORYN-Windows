# ORYN Windows V10.4.1 — Website-Ready Installer

This packaging branch is based on the locked ORYN Pattern Forge Pro V10.4.1 Hotfix source.

Locked source markers preserved:
- Pattern Forge: `PF-PRO-V10.4.1-20260828-1`
- Motion baseline: `UC-DUNE-MOTION-V9-20260827-1`

## What the customer receives

`ORYN-Windows-Setup-V10.4.1.exe`

The customer's Windows 10/11 x64 PC does **not** need Python, Node.js, npm, Git, GitHub Desktop, or VS Code. The installer contains the packaged ORYN runtime, the production UI, Pattern Forge, 100 THR patterns, cached previews, and the existing Windows desktop shell.

The application installs per-user under `%LOCALAPPDATA%\Programs\ORYN`, creates a Start Menu shortcut, optionally creates a Desktop shortcut, and includes normal Windows uninstall support.

## GitHub build — easiest method

1. Create/use a Windows repository such as `ORYN-Windows`.
2. Upload the **extracted contents** of this project, including the hidden `.github` folder.
3. Commit to `main`.
4. Open **Actions → Build ORYN Windows V10.4.1 Installer**.
5. The workflow can run automatically after the push, or choose **Run workflow**.
6. When the green build completes, download the artifact named:
   `ORYN-Windows-V10.4.1-Installer`
7. Extract the downloaded GitHub artifact ZIP.
8. The customer/public file is:
   `ORYN-Windows-Setup-V10.4.1.exe`
9. Test that EXE on a clean Windows 10/11 x64 PC, then upload the EXE to your website.

## Local build on a Windows development PC

One-time build-PC requirements:
- Python 3.12 x64
- Inno Setup 6

Then double-click:

`build-ORYN-Windows-V10.4.1.bat`

The finished setup EXE will appear under `release\`.

## No application changes

The Windows release layer packages the existing source. It does not edit HOME, calibration, Theta–Rho motion, clearing, playback, Pattern Forge, patterns, UI, table settings, controller logic, or the locked motion baseline.

## Public website note

The generated installer is installable but unsigned unless you add a Windows code-signing certificate. An unsigned download can trigger Microsoft SmartScreen's "Windows protected your PC" reputation warning on some customer machines. Code-signing can be added later without changing ORYN application behavior.
