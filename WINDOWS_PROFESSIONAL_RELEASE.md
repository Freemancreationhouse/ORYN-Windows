# ORYN v3.3 — Professional Windows Release

## Result

After building on a Windows development PC, the output is:

`release/ORYN-Setup-v3.3.exe`

The customer only downloads and runs this EXE. The customer does **not** need:
Python, Node.js, Git, GitHub Desktop, or Visual Studio Code.

## One-time requirements on the BUILD PC

Install:
1. Python 3.11 or Python 3.12 (64-bit)
2. Inno Setup 6

Then double-click:

`build-ORYN-Setup-v3.3.bat`

The builder:
1. creates an isolated build environment;
2. installs ORYN's non-Raspberry-Pi dependencies;
3. packages the Python application with PyInstaller;
4. includes the production frontend, patterns and required assets;
5. creates a proper Windows installer with Inno Setup.

## Customer installation

The customer downloads:

`ORYN-Setup-v3.3.exe`

Then:
1. Double-click the installer.
2. Click Install.
3. Launch ORYN from the Start Menu or optional Desktop shortcut.
4. ORYN opens at `http://127.0.0.1:8080`.

## GitHub Release

GitHub repository → Releases → Draft a new release.

Suggested:
- Tag: `v3.3.0`
- Title: `ORYN v3.3 — Designed to Move`
- Attach: `ORYN-Setup-v3.3.exe`

Keep the source repository and Raspberry Pi installer in the same ORYN project.

## Important

This packaging project does not rewrite ORYN's HOME, controller, calibration,
Theta–Rho playback, pattern, clearing, terminal, or Pattern Forge logic.
