# ORYN v3.3 — Windows Desktop Uvicorn Logging Fix

Observed installed-app failure:

`AttributeError: 'NoneType' object has no attribute 'isatty'`
followed by:
`ValueError: Unable to configure formatter 'default'`

Cause:
PyInstaller's windowed/no-console mode sets `sys.stdout` and `sys.stderr` to
`None`. Uvicorn's default logging formatter checks whether its output stream is
a TTY by calling `.isatty()`, so Uvicorn failed before FastAPI could start.

Fix in the Windows packaging layer only:
- provide hidden file-backed stdout/stderr streams under `%LOCALAPPDATA%\ORYN`;
- disable Uvicorn's console logging config with `log_config=None`;
- keep ORYN's own logging and startup diagnostics;
- keep WebView2 desktop launching and the prior signal-thread workaround.

No HOME, controller, calibration, Theta–Rho, pattern, clearing, machine-state,
terminal, or Pattern Forge code changed.
