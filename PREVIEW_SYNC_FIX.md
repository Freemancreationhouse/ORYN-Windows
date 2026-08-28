# ORYN Preview Synchronization Fix

Targeted UI-only correction: the live expanded pattern preview now maps directly to backend-reported execution progress (`current / total`). The previous hard-coded 4.2 coordinates/second predictor was removed because it could lag behind the physical machine at higher real execution rates.

Machine motion, Theta–Rho mathematics, speed, homing, calibration, serial-terminal fix, and controller commands are unchanged.
