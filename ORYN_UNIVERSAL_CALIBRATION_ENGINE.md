# ORYN Universal Calibration Engine

This Pi release makes custom Theta-Rho geometry calibration machine-independent.

## Learned geometry
- Full Circle Calibration: exact controller X travel for one physical 360 degree rotation.
- Perimeter Calibration: exact controller Y travel from Center (rho=0) to physical Perimeter (rho=1).
- Radial direction is learned automatically from the Center -> Perimeter jog.
- Angular direction is represented by the sign of the saved full-circle controller travel.

## Universal THR conversion
When both calibrations are saved:
- theta controller delta = (delta_theta / 2pi) * saved_full_circle_units
- rho controller delta = delta_rho * saved_perimeter_units * learned_rho_direction

Machine-specific step/mm, table radius, pulley size, microstepping and legacy reference coupling are no longer used to scale custom calibrated pattern geometry.

## Safety / compatibility
- Existing source geometry remains the fallback until calibration is saved.
- Existing known reference-machine coupling remains available only when universal geometry is not fully calibrated.
- Existing safe HOME uses the same saved radial calibration and learned radial direction.
- Pattern commands remain explicit G90 G21 absolute motion.
