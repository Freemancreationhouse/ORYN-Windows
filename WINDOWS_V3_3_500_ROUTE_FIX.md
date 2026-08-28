# ORYN v3.3 Windows — HTTP 500 Route Fix

The installed ORYN backend was starting correctly and connecting to COM7, but
GET / returned HTTP 500 because the legacy Jinja `redirect.html` route crashed.

This release:
- serves `static/dist/index.html` directly at `/`;
- serves the same React shell at `/settings`;
- adds a React Router fallback for direct/refresh URLs such as `/table-control`;
- registers the fallback after all backend API routes;
- retains `/api/*`, `/static/*`, WebSocket and documentation backend routing;
- keeps the Windows PyInstaller classic one-folder data layout;
- keeps the startup diagnostics from the previous Windows packaging fix.

Machine motion, HOME, calibration, controller, clearing, terminal, pattern
execution, machine state and Pattern Forge modules are unchanged.
