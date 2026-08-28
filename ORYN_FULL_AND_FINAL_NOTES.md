# ORYN — Full & Final Windows UI Pass

Base: the already-working ORYN v3.6 Windows build.

Only the requested remaining items were changed.

Pattern Forge
- Fixed detailed raster generation failure by replacing recursive skeleton DFS
  with iterative traversal.
- Left controls have independent full-height scrolling.
- Right source/output side also has independent scrolling.
- Original preview is visible for PNG/JPG/JPEG/WEBP/BMP/SVG.
- DXF/THR source filename remains visible and the generated THR route appears
  after generation.
- All left-side labels, values and indicators use explicit high-contrast colors.
- Generate/Save stays reachable at the bottom of the left column.
- Full route preview is scrollable and remains visible.

Delete Pattern
- Visible Delete Pattern action is injected into the active selected-pattern
  action row.
- Uses the existing /delete_theta_rho_file backend.
- Asks for confirmation.
- Protects the three system clearing patterns only.

Branding
- Window/browser top title: ORYN
- One page footer at the true bottom:
  ORYN — Designed to Move — by Studio Kinematics™

Cleanup
- Removed references to the stacked v3.4/v3.5/v3.6 UI overlay scripts/styles.
- Kept the already-working exact perimeter calibration JS.
- Uses one final CSS and one final UI JS layer.

The controller, HOME, Theta–Rho, pattern manager and machine-state modules are unchanged.
