# ORYN v3.3 — Runtime Branding-Only Fix

Base: the working ORYN v3.3 Windows build.

Why KinetiQ Motion could still appear:
The frontend already defaulted to ORYN, but it then fetched the saved backend
application name from `/api/settings` / table-info. An older persisted
`app_name` could therefore overwrite the visible ORYN header.

This fix changes only UI-facing branding responses:
- `/api/settings` reports app name as `ORYN`;
- table-info/discovery reports `app_name` as `ORYN`;
- captive portal visible title/welcome text says ORYN;
- startup/shutdown visible log labels say ORYN.

No controller, HOME, perimeter calibration, Theta–Rho, clearing, pattern,
machine-state, Pattern Forge, Windows desktop launcher, or installer logic was changed.
