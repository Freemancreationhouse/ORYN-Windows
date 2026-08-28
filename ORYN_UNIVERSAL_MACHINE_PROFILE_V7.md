# ORYN Universal Machine Profile V7
Build: UC-DRIVER-PROFILE-V7-20260827-1

## Purpose
Driver/microstep changes no longer require ORYN code changes or manual terminal edits.

Machine Setup now separates:
1. Hardware/controller layer: driver, physical microstep, FluidNC steps/unit, max rate, acceleration.
2. Physical geometry layer: exact 360 degree rotation and exact Centre-to-Perimeter travel.
3. THR execution layer: normalized theta/rho conversion and coordinated speed planning.

## Driver profile workflow
- Physically install/set driver and DIP/jumper microstep.
- Open Settings > Hardware Setup > Universal Machine Profile.
- Select the actual driver and physical microstep for X and Y.
- Apply Driver / Microstep.
- ORYN scales FluidNC steps/unit by new_microstep / previous_microstep, preserving physical controller-unit scale.
- Max rate and acceleration remain FluidNC firmware safety limits.
- Verify/save exact 360 and Perimeter calibration.

## Current A4988 migration
Legacy ORYN reference is A4988 at 1/16 microstep. If all three A4988 jumpers have been removed, select Full step for both axes and Apply.
For the controller values previously reported by the user, the expected scaling is:
- X: 410 / 16 = 25.625 steps/unit
- Y: 287 / 16 = 17.9375 steps/unit

## Pattern stop fix
The old universal executor used a fixed 5 second acknowledgement timeout. Slow planner segments could exceed it and falsely stop clearing after about one revolution. V7 derives timeout from segment duration (15 to 120 seconds) and never resends an uncertain relative move.
