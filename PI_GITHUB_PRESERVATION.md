# ORYN Raspberry Pi GitHub Preservation Note

This package is prepared from the supplied ORYN desktop source for Raspberry Pi installation through GitHub.

The ORYN application source, prebuilt frontend, patterns, motion/controller logic, calibration behavior, Pattern Forge, branding overrides, and UI files are preserved unchanged.

Only deployment/repository packaging was adjusted:

1. `.gitignore` now explicitly includes the existing ORYN runtime CSS/JS and image assets required by the locked UI.
2. `requirements-pi-zero2.txt` mirrors the existing Python requirements except for the Raspberry-Pi-5-only NeoPixel backend.
3. `setup-pi.sh` automatically selects that Zero 2 W requirements file when the detected board is Raspberry Pi Zero 2 W.
4. Local Windows build products (`.build-venv`, root `build`, root `dist`, `release`) are omitted from this Pi/GitHub package because they are not used by Raspberry Pi runtime. `static/dist` is retained because it is the prebuilt ORYN UI used on the Pi.

Install after pushing this folder to `Freemancreationhouse/ORYN` on branch `main`:

```bash
curl -fsSL https://raw.githubusercontent.com/Freemancreationhouse/ORYN/main/install-pi-from-github.sh | bash
```
