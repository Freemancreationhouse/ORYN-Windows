#!/bin/bash

# Install ORYN Touch as a systemd service

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

# Get the current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR"

# Get the current user (the one who called sudo)
ACTUAL_USER="${SUDO_USER:-$USER}"
USER_HOME=$(eval echo ~$ACTUAL_USER)

echo "Installing ORYN Touch service..."
echo "App directory: $APP_DIR"
echo "User: $ACTUAL_USER"
echo "User home: $USER_HOME"

# Update paths in the service file
sed "s|/home/pi/oryn-touch|$APP_DIR|g" "$SCRIPT_DIR/oryn-touch.service" > /tmp/oryn-touch.service
sed -i "s|User=pi|User=$ACTUAL_USER|g" /tmp/oryn-touch.service
sed -i "s|Group=pi|Group=$ACTUAL_USER|g" /tmp/oryn-touch.service

# Copy service file to systemd directory
cp /tmp/oryn-touch.service /etc/systemd/system/

# Reload systemd
systemctl daemon-reload

# Enable the service
systemctl enable oryn-touch.service

echo "✅ Service installed and enabled!"
echo ""
echo "Commands to manage the service:"
echo "  Start:   sudo systemctl start oryn-touch"
echo "  Stop:    sudo systemctl stop oryn-touch"  
echo "  Status:  sudo systemctl status oryn-touch"
echo "  Logs:    sudo journalctl -u oryn-touch -f"
echo ""
echo "The app will now start automatically on boot."