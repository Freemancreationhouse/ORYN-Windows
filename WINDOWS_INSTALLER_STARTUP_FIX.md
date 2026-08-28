# ORYN v3.3 — Windows Installer Startup Fix

The previous standalone installer could install successfully but ORYN.exe could
close immediately.

Cause:
PyInstaller 6 uses an `_internal` content directory by default for one-folder
applications. ORYN's proven runtime intentionally uses ordinary relative paths
such as `./static`, `./patterns`, and other application folders. The packaged EXE
therefore did not see the same folder layout as the working source application.

Fix:
- PyInstaller `contents_directory="."` keeps bundled data next to `ORYN.exe`.
- The launcher waits for port 8080 before opening the browser.
- Startup details are written to `%LOCALAPPDATA%\ORYN\startup.log`.
- Fatal startup exceptions are written to
  `%LOCALAPPDATA%\ORYN\startup-error.log` and shown in a Windows error box.
- `ORYN-Diagnostics.bat` is included beside the installed application.

No ORYN HOME, controller, calibration, Theta–Rho, pattern, clearing, terminal,
or Pattern Forge logic was changed.
