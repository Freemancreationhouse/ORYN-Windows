#!/usr/bin/env bash
set -e
printf 'Repo build marker: '
if [ -f BUILD_UNIVERSAL_FINAL.txt ]; then grep '^Build:' BUILD_UNIVERSAL_FINAL.txt; else echo 'MISSING'; fi
printf 'Runtime API: '
curl -fsS http://127.0.0.1:8080/api/universal-calibration || true
echo
