# ORYN UI Edition v2.1 — Verification

## Scope

This release changes presentation/branding while retaining the working Source Edition v2.0 machine-control behavior.

## UI changes

- New Studio Kinematics visual system
- Revised card radii and panel hierarchy
- New primary/secondary button geometry
- Updated icon sizing and control density
- New navigation treatment
- Refined typography spacing and hierarchy
- New form/input appearance
- New panel shadows and border treatment
- Improved desktop spacing
- Improved mobile touch targets
- Refined light/dark appearance
- Reduced-motion accessibility support

The visual skin is implemented in `frontend/src/index.css` and also appended to the prebuilt production stylesheet under `static/dist/assets/`, so the redesigned appearance is present without requiring a frontend rebuild.

## Machine-control preservation checks

The following working backend functions were structurally compared with Source Edition v2.0 after normalizing branding-only text and are unchanged:

- `send_home`
- `get_perimeter_calibration`
- `start_perimeter_calibration`
- `jog_perimeter_calibration`
- `save_perimeter_calibration`
- `set_perimeter_calibration`
- `reset_perimeter_calibration`
- `cancel_perimeter_calibration`
- `move_to_center`
- `move_to_perimeter`
- playlist skip/reorder functions
- custom clearing-pattern settings functions

Core connection, pattern manager, and machine-state modules were also structurally verified after branding normalization.

## Branding cleanup

A full repository scan was performed. The previous reference product name does not occur in application files, source UI, generated UI assets, service names, firmware profile paths/labels, documentation, package metadata, or touch-interface paths.

The original name remains only in `LICENSE`, where the original licensing/copyright notice is intentionally preserved.

## Validation

- Python source compilation: PASS
- `setup-pi.sh` shell syntax: PASS
- ORYN CLI shell syntax: PASS
- Prebuilt production JavaScript syntax: PASS
- Repository old-brand scan outside license files: PASS (0 matches)
