# Custom GRBL pattern rho correction

Targeted correction only.

- Known original machine profiles retain their existing theta-to-rho mechanical coupling compensation unchanged.
- Unknown/custom GRBL tables no longer receive reference-machine coupling compensation during pattern/clear playback.
- Saved perimeter calibration remains the sole rho 0..1 radial scale for a custom table.
- HOME, perimeter calibration, controller settings, theta conversion, pattern files, UI and Pattern Forge are otherwise unchanged.
