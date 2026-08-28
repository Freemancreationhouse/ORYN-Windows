# Studio Kinematics ORYN v3.0

## What changed

This release keeps the proven machine motion core from Source Edition unchanged and adds a new product-facing layer.

### New visual system
- New Lucide-based navigation icon family.
- New Pattern Details action deck with non-pill controls.
- Clearing strategies use icon tiles: Adaptive, From Center, From Perimeter, Diagonal, None.
- New Run Pattern command block and compact Next / Queue controls.
- Pattern preview frame changed from a circular/pill visual language to a chamfered technical frame.

### Pattern Forge
Browse → **Pattern Forge** imports:
- SVG
- DXF
- PNG
- JPG / JPEG
- WEBP / BMP
- existing THR

The generator is isolated from machine motion. It creates normalized THR geometry, previews it, and saves only the approved generated route into `patterns/custom_patterns`.

Raster line art is filtered, skeletonized and walked along connected artwork. Long disconnected islands are skipped instead of automatically drawing long straight pass-lines through the design. SVG/DXF keep vector geometry and also avoid long automatic bridges.

### API v2 additions
- `GET /api/v2/capabilities`
- `POST /api/v2/pattern-generator/preview`
- `POST /api/v2/pattern-generator/save`

These are additions only. Existing source APIs remain available so the proven machine functions are not broken.

## Motion-core preservation
The following source files remain byte-identical to UI Edition v2.2:
- `modules/connection/connection_manager.py`
- `modules/core/process_thr.py`

HOME, Center/Perimeter, calibrated rho conversion, FluidNC transport, clearing execution and THR playback are therefore not rewritten by this release.
