# ORYN v3.2 — Correction Scope

This release changes only:
- UI presentation for the Studio Kinematics logo;
- UI position/layer of Playing / Not Playing;
- Pattern Forge dialog presentation;
- isolated `modules/pattern_generator/converter.py` image-to-THR conversion.

The proven machine-control core is unchanged:
- connection manager;
- HOME / controller behavior;
- Theta–Rho execution;
- pattern manager;
- machine state;
- calibration/perimeter behavior;
- clearing execution;
- terminal/playback logic.

Pattern Forge v3.2:
- auto-crops broad blank margins;
- auto-contrasts uploaded raster artwork;
- preserves line art directly when possible;
- traces outlines for filled/photographic images;
- repairs only short broken gaps;
- retains substantially more meaningful components/details;
- still refuses long automatic bridges through blank artwork;
- shows ORIGINAL and CLEAN ROUTE side-by-side before saving.
