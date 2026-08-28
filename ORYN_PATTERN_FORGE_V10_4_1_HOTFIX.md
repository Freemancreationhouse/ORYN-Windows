# ORYN Pattern Forge V10.4.1 Hotfix

- Baseline: V10.4
- Fix: add missing Python `re` import used by async preview-job polling and save token/name sanitization.
- Symptom fixed: `GET /api/v2/pattern-generator/preview-job/<id>` returned HTTP 500 with `NameError: name 're' is not defined`.
- V9 Dune-compatible motion core remains locked and unchanged.
