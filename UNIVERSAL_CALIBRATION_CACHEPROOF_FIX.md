ORYN Universal Calibration cache-proof UI fix
- Full Circle Calibration is embedded directly in static/dist/index.html.
- Existing PWA caches are cleared by a replacement service worker.
- Frontend shell is served with no-store/no-cache headers.
- Rotation calibration backend endpoints and universal pattern transform are preserved.
