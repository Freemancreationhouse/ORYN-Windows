# ORYN Universal Calibration — Final Verified Pi Fix

Build marker: `UC-FINAL-20260826-2`

This package fixes the failed rollout where the 360-degree calibration script was embedded into `static/dist/index.html` with literal `\\n` characters and therefore never executed in the browser.

## Guaranteed delivery

`main.py` now injects `/static/custom/oryn-universal-calibration.js?v=UC-FINAL-20260826-2` into every served ORYN HTML response. The calibration launcher no longer depends on the prebuilt React bundle or DOM text matching.

After update, every ORYN page must show a fixed `360° CAL` button. The modal shows the build marker `UC-FINAL-20260826-2`.

Runtime proof endpoint:

`/api/universal-calibration`

It returns the build marker and both calibration states.

## Safety gate

If one universal geometry calibration is saved and the other is missing, `/run_theta_rho` returns HTTP 409 and refuses pattern/clean playback. This prevents mixing calibrated rho with legacy theta scaling.

## Universal geometry

When both are saved:

- theta controller increment = `(delta_theta / 2π) × theta_revolution_units`
- rho controller increment = `delta_rho × rho_travel_units × rho_direction`

The standard `clear_from_out.thr` spans about 32.99 mathematical revolutions from rho 1.0 to approximately 0.0, so with correct full-circle calibration it must execute as about 33 physical revolutions rather than 2–3.
