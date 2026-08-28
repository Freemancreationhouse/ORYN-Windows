# ORYN v3.3 — Windows Desktop Final Fix

This release fixes two separate Windows packaging problems:

1. Blank production page
   - The prior cache-busting edit accidentally changed `r.json()` in
     `static/dist/index.html` into an invalid/corrupted expression.
   - The production HTML is repaired and cache-busting is now limited to actual
     asset URL attributes.

2. Browser/terminal behavior
   - ORYN now launches inside its own Windows desktop window using pywebview
     with the Microsoft Edge WebView2 engine.
   - The FastAPI backend runs in a background thread on 127.0.0.1:8080.
   - Normal launch uses no visible console window.
   - The customer's default browser is not opened.

No controller, HOME, calibration, Theta–Rho, clearing, pattern, state, terminal,
or Pattern Forge logic was changed.
