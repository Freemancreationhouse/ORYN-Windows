# ORYN Windows V10.4.1 PD1

Standalone Windows 10/11 x64 build of the locked ORYN V10.4.1 Windows application with ORYN Pattern Designer V2.0 Pro integrated.

## Added in PD1

- Pattern Designer launcher beside Pattern Forge on Browse Patterns.
- 77 generators (37 reference-set types + 40 ORYN generators).
- Cartesian / XY and Theta–Rho / Polar modes.
- Live preview and THR/G-code/SVG/CSV/JSON/PNG exports.
- Save to ORYN Library writes generated THR into `patterns/custom_patterns` and creates the normal ORYN preview.
- Clean `/pattern-designer` desktop route.

## Preserved

The existing Windows motion core, machine profiles, calibration, clearing, Pattern Forge, queue/playback, connection logic, compiled React application and Windows desktop launcher remain preserved except for the intentionally additive Pattern Designer launcher hook. No motion routine calls the Pattern Designer integration.

## Build installer on Windows

Double-click:

`build-ORYN-Windows-V10.4.1-PD1.bat`

Build PC requirements: Python 3.12 x64 and Inno Setup 6. Customer PCs need neither.

Output:

`release/ORYN-Windows-Setup-V10.4.1-PD1.exe`

The included GitHub Actions workflow also builds the same installer on `windows-latest` after a push to `main` or manual workflow dispatch.

## Install

The Inno Setup package installs to the user's LocalAppData Programs folder, creates normal ORYN shortcuts, and launches the same embedded Edge WebView2 desktop application. The existing ORYN AppId is retained so this build upgrades an earlier ORYN Windows V10.4.1 install instead of creating an unrelated second application.
