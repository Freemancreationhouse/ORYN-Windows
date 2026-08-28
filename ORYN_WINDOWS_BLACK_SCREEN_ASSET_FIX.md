# ORYN v3.3 — Windows Black Screen Asset Fix

Observed behavior:
- ORYN desktop window opened.
- The window background became black.
- FastAPI logs showed HTTP 200 for `/assets/*.js` and `/assets/*.css`.
- React UI never appeared.

Root cause:
The production `index.html` uses Vite's absolute URLs `/assets/...`, but the
backend only mounted `/static`. The SPA fallback therefore returned
`static/dist/index.html` with HTTP 200 for JS/CSS asset requests. The browser
received HTML where JavaScript/CSS was expected, so React could not mount.

Fix:
- mount `static/dist/assets` at `/assets`;
- serve `static/dist/registerSW.js` at `/registerSW.js`;
- serve `static/dist/sw.js` at `/sw.js`;
- prevent the SPA fallback from intercepting assets/service-worker paths.

No HOME, controller, calibration, Theta–Rho, pattern, clearing, machine state,
terminal, or Pattern Forge modules changed.
