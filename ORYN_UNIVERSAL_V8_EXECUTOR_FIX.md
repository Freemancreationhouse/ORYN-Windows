# ORYN Universal V8 Executor

Universal calibrated THR playback uses a controller work frame explicitly declared from logical Theta/Rho with G92. It never derives pattern geometry from MPos/WPos.

Targets:
- X = theta / (2*pi) * saved theta revolution units
- Y = rho * saved radial travel units * saved rho direction

Each pattern point is sent as an absolute G90 target. This prevents cumulative rho drift and makes a repeated/uncertain command idempotent. The sender accepts normal `ok` immediately for smooth planner streaming; if that response is consumed/lost, it queries FluidNC live status and continues on normal Run/Jog/Hold/Idle states without waiting for each move to finish.
