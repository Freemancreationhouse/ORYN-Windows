# Studio Kinematics — ORYN UI Edition v2.1

ORYN is the Studio Kinematics control interface for Theta–Rho kinetic sand tables.

## What changed in v2.1

This release is intentionally a **UI/branding edition** of the working Motion v3.0.
The proven motion/control behavior is retained. The visual layer has been redesigned with a new Studio Kinematics appearance: revised spacing, card geometry, button shapes, icon scale, navigation treatment, typography hierarchy, panel shadows, input styling, responsive sizing, and light/dark presentation.

The product-facing name is **ORYN**. The previous reference product name has been removed from application files, UI text, metadata, service names, documentation, touch-interface names, firmware profile labels, package identifiers, and generated frontend assets. Original licensing text remains preserved in the license files as required.

## Motion and control

The Motion v3.0 behavior is retained, including sensorless homing, controller connection, Theta–Rho conversion, mechanical compensation, pattern execution, clearing, playlists, LED control, Wi‑Fi/hotspot support, terminal/debug tools, PWA/touch support, security, scheduling, MQTT/Home Assistant support, multi-table support, and the one-time calibrated Center→Perimeter mapping added for Studio Kinematics.

## Perimeter calibration

Home the table to establish the physical center, enter Perimeter Calibration, jog outward until the ball reaches the exact usable edge, then save the position. The saved controller travel becomes `rho = 1`; center remains `rho = 0`. The same normalized `.thr` artwork can therefore be used with different physical table sizes after each table is calibrated once.

## Windows

Run:

```text
run_oryn_windows.bat
```

## Raspberry Pi

Use the included Pi setup scripts and `oryn` CLI. Service names and installation paths use the ORYN branding.

## Licensing

See `LICENSE` and `LICENSE-GPL-3.0`. Required original licensing notices are intentionally preserved. Pattern/third-party attribution is retained in the accompanying attribution files.
