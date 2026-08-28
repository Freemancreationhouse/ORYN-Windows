# ORYN v3.3 — Windows Desktop Backend Startup Fix

The first desktop-shell build moved FastAPI into a worker thread so pywebview
could own the Windows UI/main thread. ORYN's existing FastAPI lifespan registers
SIGINT/SIGTERM with `signal.signal()`. Python does not permit signal handler
registration from a non-main thread, so backend startup stopped and the desktop
launcher timed out waiting for port 8080.

This release fixes that in the Windows packaging layer only:
- main-thread signal behavior remains normal;
- signal registration attempted by the embedded backend worker is safely ignored;
- FastAPI remains on 127.0.0.1:8080;
- ORYN opens in its own WebView2 desktop window;
- no browser or normal console window is required;
- startup/error diagnostics remain under `%LOCALAPPDATA%\ORYN`.

No HOME, controller, calibration, Theta–Rho, pattern, clearing, machine-state,
terminal or Pattern Forge code changed.
