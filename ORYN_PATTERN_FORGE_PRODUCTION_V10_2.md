# ORYN Pi — Pattern Forge Pro Production Fix V10.2

Motion baseline: **UC-DUNE-MOTION-V9-20260827-1 — LOCKED**.

This release changes Pattern Forge and the Settings/controller-read safety boundary only. It does not replace the working V9 Dune-compatible Theta–Rho motion core.

## Pattern Forge production scope
- Raster artwork: PNG, JPG/JPEG, WEBP, BMP.
- Raster interpretation modes: Auto, Line Art/Sketch/Logo, Photo/Painting contour interpretation.
- Vector/CAD/CNC: SVG, DXF, G-code/NC/NGC/TAP.
- Existing THR import/cleanup.
- Full source artwork preview using fit/contain, never crop-to-fill.
- Async server-side conversion jobs prevent long image conversions from holding one HTTP request open and triggering a reverse-proxy 504.
- UI converts HTML/gateway failures into concise user-facing messages and preserves the selected artwork for retry.
- Raster tracing uses photo normalization, adaptive/edge extraction, fast topology-preserving thinning, noise/spur cleanup, corner-preserving smoothing and geometry simplification.
- Connected raster components are made continuous by retracing only existing ink where topology requires it; disconnected components use a user-selectable Shortest/Auto/Perimeter connector strategy.
- Final THR output is validated and densified to bounded theta/rho increments; the generated preview is the same coordinate list saved to the library.

## Playback/settings concurrency fix
While a pattern or clear is active:
- opening Hardware Setup / Machine Setup remains safe;
- the machine-profile card displays cached values and becomes read-only;
- backend configuration traffic ($CD, $$, $/path and GRBL $nnn configuration commands) is blocked before any serial input flush/read can happen;
- apply/write/raw-controller operations are rejected until playback stops.

After playback stops, normal live controller reads and hardware changes are available again.
