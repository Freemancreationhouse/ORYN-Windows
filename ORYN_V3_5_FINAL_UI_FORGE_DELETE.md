# ORYN v3.5 Final UI + Pattern Forge + Delete

Built from the working v3.4 machine-control base.

Corrections:
- Light/Dark toggle is synchronized from the real React `html.dark` state and visibly changes the whole interface.
- Exact Perimeter Calibration base CSS is restored, so all IN/OUT/Save/Update buttons are visible and retain the working calibration API behavior.
- Pattern Forge launcher is mounted from the Browse Patterns heading rather than depending on the old Add Pattern button.
- Pattern Forge supports PNG/JPG/WEBP/BMP, SVG, DXF and THR with fit, threshold, invert, smoothing, simplify, rotation, X/Y offset, max connector gap and start preference.
- Generated route is previewed before Save to Library. Long disconnected islands are skipped instead of creating large pass-lines.
- Delete Pattern is added to the selected-pattern action area and uses the existing `/delete_theta_rho_file` endpoint with confirmation.
- Footer: ORYN — Designed to Move — by Studio Kinematics™.

Machine/controller/Theta–Rho/playlist/clearing/state code is unchanged.
