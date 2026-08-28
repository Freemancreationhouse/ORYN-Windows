# ORYN Pattern Forge Pro Production Fix V10.2 — Verification

Build: PF-PRO-V10.2-20260828-1
Locked motion baseline: UC-DUNE-MOTION-V9-20260827-1

## Locked baseline verification
Byte-identical to V10.1/V9 baseline:
- modules/core/pattern_manager.py
- modules/connection/connection_manager.py
- BUILD_UNIVERSAL_FINAL.txt
- oryn.service
- requirements.txt
- all 9 existing static PNG/JPG/JPEG/WEBP/ICO/SVG image/logo assets

## Syntax verification
- main.py: Python compile passed
- modules/pattern_generator/converter.py: Python compile passed
- modules/connection/fluidnc_config.py: Python compile passed
- static/custom/oryn-v36-final-polish.js: Node syntax check passed
- static/custom/oryn-universal-machine-profile-v7.js: Node syntax check passed

## Exact user raster regression samples
Tested with production defaults/sensitivity 150:
1. 360_F_2093846888_KCcM7PahiPgkkmJpjgtzdJM6U57ph4w3(1).jpg
   - conversion completed ~1.2 s on build environment
   - 2,808 final THR points
   - auto-detected Line Art mode
   - 11 connected source components; 10 shortest unavoidable connectors; 0 perimeter spokes by default
   - max theta increment <= 0.11 rad; max rho increment <= 0.012
2. imge.png (large Ganesha line artwork)
   - conversion completed ~2.0 s on build environment
   - 6,304 final THR points
   - auto-detected Line Art mode
   - 16 connected source components; 15 shortest unavoidable connectors; 0 perimeter spokes by default
   - max theta increment <= 0.11 rad; max rho increment <= 0.012

Pi Zero timing will differ from this build machine, so V10.2 also uses asynchronous generation jobs: the browser request returns immediately and polls job status instead of holding one reverse-proxy request open until conversion is complete.

## Settings/playback safety
- /api/machine-hardware-profile serves cached values while playback/clear is active and does not query FluidNC.
- low-level FluidNC configuration helper blocks $CD, $$, $/path, $Config and GRBL $nnn config traffic before any serial input flush/read while playback is active.
- hardware apply/write/raw controller operations remain blocked until playback stops.
