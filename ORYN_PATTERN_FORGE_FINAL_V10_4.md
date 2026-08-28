# ORYN Pattern Forge Pro Final V10.4

Built directly on the user-confirmed V10.2 baseline.

Corrections:
- Actual served Pattern Forge UI now uses asynchronous preview-start/job polling, eliminating the stale synchronous 504 path.
- Source artwork preview uses CSS background-size: contain so global image rules cannot crop it.
- Auto raster mode recognizes high-contrast graphic/line artwork more reliably and automatically selects the usable foreground polarity.
- Artwork-safe disconnected routing enters paths at nearest artwork points and retraces existing artwork where needed instead of drawing long passing lines caused by arbitrary path starts.
- Raster line-art applies a small anti-jitter simplification floor for cleaner machine geometry.
- Runtime/release references point to Freemancreationhouse/ORYN.
- V9 motion/controller core remains unchanged.
