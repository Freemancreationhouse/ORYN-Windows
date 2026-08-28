# ORYN radial calibration / crash-home correction

This build keeps the proven Theta-Rho pattern mathematics unchanged.

Correction:
- Crash homing no longer assumes a fixed 22/30 controller-unit radial stroke when a physical perimeter calibration exists.
- HOME uses the saved Center -> Perimeter controller-unit travel.
- Homing feed is scaled to the saved travel so small-unit/full-step configurations do not run at the same raw feed as large-unit/microstep configurations.
- Pattern rho scale continues to use the same saved perimeter calibration.

Important hardware rule:
The A4988/driver microstep jumper changes physical movement per controller unit but is not electronically detectable by ORYN. Keep the jumper state fixed after calibration. If you physically change the jumper/microstep mode, update/re-run perimeter calibration for that hardware mode before using HOME or playing a pattern.

Examples observed during testing:
- Jumper/microstep configuration: approximately 52 controller units Center -> Perimeter.
- No-jumper configuration: approximately 3.02 controller units Center -> Perimeter.

Use the value measured on the actual machine; these example values are not forced into the software.
