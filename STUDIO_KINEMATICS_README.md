# Studio Kinematics ORYN — Motion v3.0

This build is based directly on the user-provided working upstream source. The working upstream sensorless HOME, THR execution, motion queue, clearing, playlists, settings, LED, Wi-Fi, MQTT, multi-table and other source features are retained.

## Studio Kinematics addition: universal perimeter calibration
1. Connect and allow the original source HOME routine to finish.
2. In **Control → Perimeter Calibration**, click **Start From Current Center**.
3. Jog OUT until the ball is exactly at the physical table edge.
4. Click **Save This Physical Position as Perimeter**.
5. The measured controller Y travel is saved persistently as `rho_travel_units`.
6. THR `rho=0` remains Center and `rho=1` becomes that exact saved edge.

No physical radius in millimetres is required. Reconnect/automatic HOME re-establishes Center but does not erase the saved perimeter travel. You can edit the saved controller-unit travel later or reset to the upstream source default.

### Motion preservation
The original source theta conversion, X scaling, steps/mm, gear ratio and coupling compensation formula are unchanged. Only the original `y_scaling_factor` is replaced by `100 / saved_center_to_perimeter_units` after calibration. Before calibration, the original source values are used unchanged.

## Real terminal
On Windows, the terminal now attaches to the already-open main COM connection when that same port is selected. This avoids trying to open COM7 twice. Raw terminal is locked during HOME/pattern playback so it cannot steal controller responses.

## Existing source functionality retained
Browse/library and previews; favorites; playlists and queue/reordering; pre-execution clearing modes; Table Control; Center/Perimeter/Align; native serial debug terminal; LED page and automation; settings; Wi-Fi/hotspot/captive portal; auto-play; scheduled Still Sands; MQTT/Home Assistant; multi-table management; update system; security modes; Raspberry Pi/touch/PWA support; FluidNC configuration tools; logs; and bundled THR patterns.

## Windows
Run `run_oryn_windows.bat`. Backend runs on port 8080 and the React frontend on port 5173.

## Licensing
The provided upstream source includes its own license files and attribution. They are preserved in this source edition. Studio Kinematics branding does not remove third-party/open-source license obligations.


## Raspberry Pi Zero 2 W — direct GitHub install

After publishing this repository to
`https://github.com/Freemancreationhouse/ORYN`, install on a Pi with:

```bash
curl -fsSL https://raw.githubusercontent.com/Freemancreationhouse/ORYN/main/install-pi-from-github.sh | bash
```

Then reboot if requested and open `http://oryn.local`.

See `GITHUB_PI_INSTALL.md` for the complete procedure.
