# ORYN v3.4 Production UI Fix

Fixes the production frontend actually served from `static/dist`.

- Replaces stale compiled KinetiQ branding with ORYN.
- Browser title: `ORYN — Designed to Move`.
- Applies final black / yellow / white palette to compiled production CSS.
- Hides the FluidNC firmware-upgrade advisory visually in the header.
- Adds v3.4 cache-busting query strings to compiled JS/CSS references.
- Machine/controller/firmware detection logic is not removed or changed.
- Proven machine core and Pattern Forge converter are unchanged.
