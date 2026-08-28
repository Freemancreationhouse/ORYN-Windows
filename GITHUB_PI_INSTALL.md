# ORYN — GitHub → Raspberry Pi Zero 2 W

This repository is prepared for direct installation from GitHub.

## Recommended Raspberry Pi

- Raspberry Pi Zero 2 W
- Raspberry Pi OS Lite (64-bit)
- Wi-Fi configured in Raspberry Pi Imager
- SSH enabled in Raspberry Pi Imager
- Controller connected by USB for the simplest first installation

The frontend is already pre-built in `static/dist`, so Node.js is not required on the Pi.

## 1. Put this project on GitHub

Create a GitHub repository named:

`ORYN-Motion`

under the GitHub account/organization:

`Freemancreationhouse`

The expected repository URL is:

`https://github.com/Freemancreationhouse/ORYN`

Upload/push the complete contents of this project to the repository root.  
Do not upload the outer ZIP as the only file. `setup-pi.sh`, `main.py`, `static/`,
`modules/`, `patterns/`, etc. must be directly visible in the repository.

If you use a different GitHub owner or repository name, replace
`Freemancreationhouse/ORYN` in `setup-pi.sh` and
`install-pi-from-github.sh` before publishing.

## 2. Flash Raspberry Pi OS

In Raspberry Pi Imager choose:

- Device: Raspberry Pi Zero 2 W
- OS: Raspberry Pi OS Lite (64-bit)
- Set hostname, for example: `oryn`
- Set your Wi-Fi SSID/password
- Enable SSH
- Create your username/password

Flash the SD card and boot the Pi.

## 3. SSH into the Pi

From Windows PowerShell:

```bash
ssh YOUR_USERNAME@oryn.local
```

If `.local` does not resolve, use the Pi IP address.

## 4. One-line installation

USB controller (recommended first):

```bash
curl -fsSL https://raw.githubusercontent.com/Freemancreationhouse/ORYN/main/install-pi-from-github.sh | bash
```

For UART GPIO instead:

```bash
curl -fsSL https://raw.githubusercontent.com/Freemancreationhouse/ORYN/main/install-pi-from-github.sh | bash -s -- --uart
```

To skip the automatic hotspot setup:

```bash
curl -fsSL https://raw.githubusercontent.com/Freemancreationhouse/ORYN/main/install-pi-from-github.sh | bash -s -- --no-hotspot
```

## 5. Reboot

If the installer asks/reports that a reboot is required:

```bash
sudo reboot
```

Wait about a minute.

## 6. Open ORYN

From a phone/computer on the same Wi-Fi:

```text
http://oryn.local
```

or:

```text
http://PI_IP_ADDRESS
```

ORYN runs automatically at boot using `systemd`, with nginx serving the
pre-built frontend on port 80 and the Python backend on localhost port 8080.

## 7. Useful commands

```bash
oryn status
oryn logs
oryn restart
oryn stop
oryn start
oryn update
oryn wifi help
```

`oryn update` pulls the newest commit from the same GitHub repository and
restarts the installed service.

## Updating the software from GitHub

On your development PC:

```bash
git add .
git commit -m "ORYN update"
git push origin main
```

On the Raspberry Pi:

```bash
oryn update
```

## Important

Keep `static/dist/` committed to GitHub. The Pi installer intentionally uses the
pre-built frontend so a Pi Zero 2 W does not need to compile the React/Vite app.
