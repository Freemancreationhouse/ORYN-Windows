# ORYN V9 Dune-compatible motion core

This build restores the coupled Theta-Rho motor transform used by the original Dune Weaver mechanism while retaining ORYN's physical calibration and hardware-profile layers.

For each THR delta:

- `dX = dTheta / (2*pi) * saved_theta_revolution_units`
- `dY_geometry = dRho * saved_rho_travel_units * rho_direction`
- `coupling = dX * (X_steps_per_unit / (gear_ratio * Y_steps_per_unit)) * mechanism_sign * rho_direction`
- `dY_motor = dY_geometry + coupling`

The coupling term is the critical mechanical compensation. Rotating theta mechanically changes rho on this mechanism; commanding only the geometric rho delta makes the ball consume the radius in a few turns.

Motion transport is one coordinated `G91 G21 G1 X.. Y.. F..` segment. The serial connection lock is held for the send/ack transaction so other status readers cannot steal the controller acknowledgement. `ok` is treated as planner acceptance, not physical completion, allowing FluidNC to buffer consecutive points smoothly.

Set environment variable `ORYN_KINEMATICS=independent` only for a genuinely independent two-motor polar mechanism that does not need theta-to-rho coupling.
