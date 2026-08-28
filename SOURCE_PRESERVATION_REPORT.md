# Source Preservation Report

## Working HOME
The `modules/connection/connection_manager.py::home()` function is byte-for-byte unchanged from the user-provided source archive.

SHA-256 of the preserved HOME function:
`fa09b358a601f992486ec8c66dd64cafc11a557710c6253a61f47d653ef37283`

That means crash/sensor homing behavior, original HOME command transport, idle detection, machine-position refresh and completion logic come directly from the provided working source.

## Motion change
The original source Mini radial conversion uses `y_scaling_factor = 3.7`, which corresponds to about `27.027027` controller Y units for rho 0→1.

ORYN preserves that exact value until a user saves a physical perimeter. After calibration only the radial scale is calculated as `y_scaling_factor = 100 / saved_rho_travel_units`. The original theta conversion, X scaling, steps/mm, gear-ratio and mechanical coupling compensation formula are unchanged.

## Source panels/functions retained
- Browse Patterns + previews + favorites + history
- Playlists, queue, reorder, run modes, clear handling
- Table Control: Home, Stop, Reset, Center, Perimeter, Align, speed, clear controls
- Real Serial Terminal (enhanced to attach to the active COM connection)
- LED controls and playback/idle automation
- Settings and machine/FluidNC settings
- Wi-Fi / hotspot / captive portal
- Auto-play
- Still Sands scheduled pause
- MQTT / Home Assistant
- Multi-table management
- Security modes
- Update system
- Raspberry Pi/touch/PWA support
- Logs and diagnostics
- Bundled THR library (100 files in this archive)

## Studio Kinematics addition
- Persistent Center→Perimeter calibration for arbitrary physical table diameter
- Direct edit/reset of the saved controller-unit radial travel
- Calibration survives reconnect/restart; HOME re-establishes center without deleting the saved edge
