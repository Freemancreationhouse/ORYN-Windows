# ORYN v3.3 — Exact UI Fix

This package starts from the Windows v3.3 build already confirmed working.

The previous UI patch failed for two concrete reasons:
1. It polled `/api/status` for perimeter-calibration state, but the working
   backend exposes that state at `GET /api/perimeter-calibration`.
2. It colored the image itself, while the existing stylesheet applies
   `.dark .pattern-preview { filter: invert() }`. The real circular plate
   remained dark.

This correction:
- uses the exact existing perimeter API contract;
- switches to jog/save state from the backend's `active/current_units` values;
- sends the exact `{units, speed:60}` jog payload already used by the source UI;
- colors the real preview parent yellow;
- disables the old dark-theme inversion;
- uses `mix-blend-mode:multiply` so white preview backgrounds become yellow
  while dark pattern linework remains dark;
- works in both light and dark modes.

No machine, motion, controller, HOME, Theta–Rho, pattern execution, clearing,
machine state, Pattern Forge, Windows launcher or installer logic was changed.
