#!/bin/bash
# ORYN Touch - One-Command Installer
# This script sets up everything needed to run ORYN Touch on boot

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTUAL_USER="${SUDO_USER:-$USER}"
USER_HOME=$(eval echo ~$ACTUAL_USER)

# Detect Raspberry Pi model
PI_MODEL=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\0' || echo "unknown")
IS_PI5=false
if [[ "$PI_MODEL" == *"Pi 5"* ]]; then
    IS_PI5=true
fi

echo "🎯 ORYN Touch - Complete Installation"
echo "============================================="
echo "App directory: $SCRIPT_DIR"
echo "User: $ACTUAL_USER"
echo "Detected: $PI_MODEL"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This installer must be run with sudo privileges"
    echo ""
    echo "Usage: sudo ./install.sh"
    echo ""
    exit 1
fi

echo "🔧 Installing system components..."
echo ""

# Function to install system scripts
install_scripts() {
    echo "📄 Installing system scripts..."
    
    local scripts=("screen-on" "screen-off" "touch-monitor")
    
    for script in "${scripts[@]}"; do
        local source_path="$SCRIPT_DIR/scripts/$script"
        local target_path="/usr/local/bin/$script"
        
        if [ -f "$source_path" ]; then
            cp "$source_path" "$target_path"
            chmod 755 "$target_path"
            chown root:root "$target_path"
            echo "   ✅ $script → $target_path"
        else
            echo "   ⚠️  $script not found at $source_path"
        fi
    done
    
    echo "   📄 System scripts installed"
}

# Function to setup systemd service
setup_systemd() {
    echo "🚀 Setting up systemd service..."

    local SERVICE_FILE="/etc/systemd/system/oryn-touch.service"

    # Generate service file with EGLFS backend (GPU-accelerated, proper compositing)
    # Pi 5 rotation is handled in QML since EGLFS rotation may not work on Pi 5
    echo "   ℹ️  Using EGLFS backend (GPU-accelerated)"

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=ORYN Touch Interface
After=multi-user.target network-online.target
Wants=network-online.target
# Wait for DRM/KMS devices to be ready
After=systemd-udev-settle.service
Wants=systemd-udev-settle.service

[Service]
Type=simple
User=$ACTUAL_USER
Group=$ACTUAL_USER
WorkingDirectory=$SCRIPT_DIR
Environment=QT_QPA_PLATFORM=eglfs
Environment=QT_QPA_EGLFS_ALWAYS_SET_MODE=1
Environment=QT_QPA_EGLFS_HIDECURSOR=1
Environment=QT_QPA_EGLFS_INTEGRATION=eglfs_kms
Environment=QT_QPA_EGLFS_KMS_ATOMIC=1
ExecStart=$SCRIPT_DIR/venv/bin/python $SCRIPT_DIR/main.py
Restart=always
RestartSec=10
StartLimitInterval=200
StartLimitBurst=5

[Install]
WantedBy=multi-user.target
EOF

    # Enable service
    systemctl daemon-reload
    systemctl enable oryn-touch.service

    echo "   🚀 Systemd service installed and enabled"
}

# Function to configure boot settings for DSI display
configure_boot_settings() {
    echo "🖥️  Configuring boot settings for DSI display..."

    local CONFIG_FILE="/boot/firmware/config.txt"
    # Fallback to old path if new path doesn't exist
    [ ! -f "$CONFIG_FILE" ] && CONFIG_FILE="/boot/config.txt"

    if [ ! -f "$CONFIG_FILE" ]; then
        echo "   ⚠️  config.txt not found, skipping boot configuration"
        return
    fi

    # Backup config.txt
    cp "$CONFIG_FILE" "${CONFIG_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "   ✅ Backed up config.txt"

    # Remove old/conflicting KMS settings
    sed -i '/dtoverlay=vc4-fkms-v3d/d' "$CONFIG_FILE"
    sed -i '/dtoverlay=vc4-xfkms-v3d/d' "$CONFIG_FILE"

    if [ "$IS_PI5" = true ]; then
        # Pi 5: KMS is enabled by default, gpu_mem is ignored (dedicated VRAM)
        echo "   ℹ️  Pi 5 detected - KMS enabled by default, skipping vc4-kms-v3d overlay"
        echo "   ℹ️  Pi 5 has dedicated VRAM, skipping gpu_mem setting"
    else
        # Pi 3/4: Add full KMS if not present
        if ! grep -q "dtoverlay=vc4-kms-v3d" "$CONFIG_FILE"; then
            # Find [all] section or add at end
            if grep -q "^\[all\]" "$CONFIG_FILE"; then
                sed -i '/^\[all\]/a dtoverlay=vc4-kms-v3d' "$CONFIG_FILE"
            else
                echo -e "\n[all]\ndtoverlay=vc4-kms-v3d" >> "$CONFIG_FILE"
            fi
            echo "   ✅ Enabled full KMS (vc4-kms-v3d) for eglfs support"
        else
            echo "   ℹ️  Full KMS already enabled"
        fi

        # Add GPU memory if not present (only for Pi 3/4 with shared memory)
        if ! grep -q "gpu_mem=" "$CONFIG_FILE"; then
            echo "gpu_mem=128" >> "$CONFIG_FILE"
            echo "   ✅ Set GPU memory to 128MB"
        else
            echo "   ℹ️  GPU memory already configured"
        fi
    fi

    # Disable splash screens for cleaner boot (all Pi models)
    if ! grep -q "disable_splash=1" "$CONFIG_FILE"; then
        echo "disable_splash=1" >> "$CONFIG_FILE"
        echo "   ✅ Disabled rainbow splash"
    else
        echo "   ℹ️  Rainbow splash already disabled"
    fi

    echo "   🖥️  Boot configuration updated"
}

# Function to setup touch rotation via udev rule
setup_touch_rotation() {
    echo "👆 Setting up touchscreen rotation..."

    local UDEV_RULE_FILE="/etc/udev/rules.d/99-ft5x06-rotate.rules"

    # Pi 5 with linuxfb: QML handles rotation (including touch transform)
    # Pi 3/4: Use udev rule for touch rotation to match kernel framebuffer rotation
    if [ "$IS_PI5" = true ]; then
        echo "   ℹ️  Pi 5 detected - touch rotation handled by QML, skipping udev rule"
        # Remove any existing touch rotation rule
        if [ -f "$UDEV_RULE_FILE" ]; then
            rm -f "$UDEV_RULE_FILE"
            udevadm control --reload-rules
            udevadm trigger
            echo "   ✅ Removed existing touch rotation udev rule"
        fi
    else
        # Create udev rule for FT5x06 touch controller (180° rotation)
        cat > "$UDEV_RULE_FILE" << 'EOF'
# Rotate FT5x06 touchscreen 180 degrees using libinput calibration matrix
# Matrix format: a b c d e f 0 0 1
# For 180° rotation: -1 0 1  0 -1 1  0 0 1
# This inverts both X and Y axes (equivalent to 180° rotation)
SUBSYSTEM=="input", KERNEL=="event*", ATTRS{name}=="*generic ft5x06*", \
  ENV{LIBINPUT_CALIBRATION_MATRIX}="-1 0 1  0 -1 1  0 0 1"
EOF

        chmod 644 "$UDEV_RULE_FILE"
        echo "   ✅ Touch rotation udev rule created: $UDEV_RULE_FILE"

        # Reload udev rules
        udevadm control --reload-rules
        udevadm trigger
        echo "   ✅ Udev rules reloaded"

        echo "   👆 Touch rotation configured (180°)"
    fi
}

# Function to hide mouse cursor
hide_mouse_cursor() {
    echo "🖱️  Configuring mouse cursor hiding..."

    # Install unclutter for hiding mouse cursor when idle
    echo "   📦 Installing unclutter..."
    apt install -y unclutter > /dev/null 2>&1

    # Create autostart directory if it doesn't exist
    local AUTOSTART_DIR="$USER_HOME/.config/autostart"
    mkdir -p "$AUTOSTART_DIR"
    chown -R "$ACTUAL_USER:$ACTUAL_USER" "$USER_HOME/.config"

    # Create unclutter autostart entry
    cat > "$AUTOSTART_DIR/unclutter.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=Unclutter
Comment=Hide mouse cursor when idle
Exec=unclutter -idle 0.1 -root
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF

    chown "$ACTUAL_USER:$ACTUAL_USER" "$AUTOSTART_DIR/unclutter.desktop"

    echo "   🖱️  Mouse cursor hiding configured"
}

# Function to setup kiosk optimizations
setup_kiosk_optimizations() {
    echo "🖥️  Setting up kiosk optimizations..."

    local CMDLINE_FILE="/boot/firmware/cmdline.txt"
    [ ! -f "$CMDLINE_FILE" ] && CMDLINE_FILE="/boot/cmdline.txt"

    # Determine DSI connector name based on Pi model
    # Pi 5 uses DSI-2 (separate DRM device), Pi 3/4 use DSI-1
    local DSI_CONNECTOR="DSI-1"
    if [ "$IS_PI5" = true ]; then
        DSI_CONNECTOR="DSI-2"
        echo "   ℹ️  Pi 5 detected - using DSI-2 connector"
    fi

    # Configure cmdline.txt for display and boot
    if [ -f "$CMDLINE_FILE" ]; then
        cp "$CMDLINE_FILE" "${CMDLINE_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

        # Add video parameter for DSI display with rotation
        # Check for any existing DSI video configuration
        if ! grep -q "video=DSI-[0-9]:800x480@60,rotate=180" "$CMDLINE_FILE"; then
            sed -i "s/$/ video=${DSI_CONNECTOR}:800x480@60,rotate=180/" "$CMDLINE_FILE"
            echo "   ✅ DSI display configuration added (${DSI_CONNECTOR}:800x480@60, rotated 180°)"
        else
            echo "   ℹ️  DSI display configuration already present"
        fi

        # Add quiet splash for cleaner boot
        if ! grep -q "quiet splash" "$CMDLINE_FILE"; then
            sed -i 's/$/ quiet splash/' "$CMDLINE_FILE"
            echo "   ✅ Boot splash enabled"
        else
            echo "   ℹ️  Boot splash already enabled"
        fi

        # Disable console cursor (the blinking underscore on fbcon)
        if ! grep -q "vt.global_cursor_default=0" "$CMDLINE_FILE"; then
            sed -i 's/$/ vt.global_cursor_default=0/' "$CMDLINE_FILE"
            echo "   ✅ Console cursor disabled"
        else
            echo "   ℹ️  Console cursor already disabled"
        fi
    fi

    echo "   🖥️  Kiosk optimizations applied"
}

# Function to create eglfs configuration for Qt
create_eglfs_config() {
    echo "🖥️  Creating EGLFS configuration..."

    local CONFIG_FILE="$SCRIPT_DIR/eglfs_config.json"

    # Find the correct DRM device with DSI connector
    local DRM_DEVICE="/dev/dri/card0"
    local DSI_CONNECTOR="DSI-1"

    # Check each card for DSI connector
    for card in /sys/class/drm/card*/; do
        card_name=$(basename "$card")
        if [ -d "$card/${card_name}-DSI-1" ]; then
            DRM_DEVICE="/dev/dri/$card_name"
            DSI_CONNECTOR="DSI-1"
            echo "   ✅ Found DSI-1 on $card_name"
            break
        elif [ -d "$card/${card_name}-DSI-2" ]; then
            DRM_DEVICE="/dev/dri/$card_name"
            DSI_CONNECTOR="DSI-2"
            echo "   ✅ Found DSI-2 on $card_name"
            break
        fi
    done

    cat > "$CONFIG_FILE" << EOF
{
  "device": "$DRM_DEVICE",
  "hwcursor": false,
  "pbuffers": true,
  "separateScreens": false,
  "outputs": [
    {
      "name": "$DSI_CONNECTOR",
      "mode": "800x480"
    }
  ]
}
EOF

    chown "$ACTUAL_USER:$ACTUAL_USER" "$CONFIG_FILE"
    chmod 644 "$CONFIG_FILE"

    echo "   ✅ EGLFS config created: $CONFIG_FILE"
    echo "   📟 Device: $DRM_DEVICE, Connector: $DSI_CONNECTOR"
}

# Function to setup user groups for DRM/input access
setup_user_groups() {
    echo "👥 Setting up user groups for hardware access..."

    local REQUIRED_GROUPS=("video" "render" "input" "gpio")

    for group in "${REQUIRED_GROUPS[@]}"; do
        if getent group "$group" > /dev/null 2>&1; then
            if id -nG "$ACTUAL_USER" | grep -qw "$group"; then
                echo "   ℹ️  User already in '$group' group"
            else
                usermod -aG "$group" "$ACTUAL_USER"
                echo "   ✅ Added user to '$group' group"
            fi
        else
            echo "   ⚠️  Group '$group' does not exist, skipping"
        fi
    done

    echo "   👥 User groups configured"
}

# Function to setup console auto-login
setup_console_autologin() {
    echo "🔑 Setting up console auto-login..."

    local OVERRIDE_DIR="/etc/systemd/system/getty@tty1.service.d"
    local OVERRIDE_FILE="$OVERRIDE_DIR/autologin.conf"

    # Create override directory
    mkdir -p "$OVERRIDE_DIR"

    # Create autologin override for getty@tty1
    cat > "$OVERRIDE_FILE" << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $ACTUAL_USER --noclear %I \$TERM
EOF

    chmod 644 "$OVERRIDE_FILE"
    echo "   ✅ Getty autologin override created: $OVERRIDE_FILE"

    # Reload systemd to pick up changes
    systemctl daemon-reload
    echo "   ✅ Systemd daemon reloaded"

    echo "   🔑 Console auto-login configured for user: $ACTUAL_USER"
}

# Function to setup Python virtual environment and install dependencies
setup_python_environment() {
    echo "🐍 Setting up Python virtual environment..."

    # Install system Qt6 and PySide6 packages for full eglfs support
    echo "   📦 Installing system Qt6 and PySide6 packages..."
    apt update
    apt install -y \
        python3-pyside6.qtcore \
        python3-pyside6.qtgui \
        python3-pyside6.qtqml \
        python3-pyside6.qtquick \
        python3-pyside6.qtquickcontrols2 \
        python3-pyside6.qtquickwidgets \
        python3-pyside6.qtwebsockets \
        python3-pyside6.qtnetwork \
        qml6-module-qtquick \
        qml6-module-qtquick-controls \
        qml6-module-qtquick-layouts \
        qml6-module-qtquick-window \
        qml6-module-qtquick-dialogs \
        qml6-module-qt-labs-qmlmodels \
        qt6-virtualkeyboard-plugin \
        qml6-module-qtquick-virtualkeyboard \
        qt6-base-dev \
        qt6-declarative-dev \
        libqt6opengl6 \
        libqt6core5compat6 \
        libqt6network6 \
        libqt6websockets6 > /dev/null 2>&1

    echo "   ✅ System Qt6/PySide6 packages installed"

    # Create virtual environment with system site packages
    if [ ! -d "$SCRIPT_DIR/venv" ]; then
        echo "   📦 Creating virtual environment with system site packages..."
        python3 -m venv --system-site-packages "$SCRIPT_DIR/venv" || {
            echo "   ⚠️  Could not create virtual environment. Installing python3-venv..."
            apt install -y python3-venv python3-full
            python3 -m venv --system-site-packages "$SCRIPT_DIR/venv"
        }
    else
        echo "   ℹ️  Virtual environment already exists"
    fi

    # Install non-Qt dependencies from requirements.txt
    echo "   📦 Installing Python dependencies..."
    "$SCRIPT_DIR/venv/bin/python" -m pip install --upgrade pip > /dev/null 2>&1
    "$SCRIPT_DIR/venv/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" > /dev/null 2>&1

    # Change ownership to the actual user (not root)
    chown -R "$ACTUAL_USER:$ACTUAL_USER" "$SCRIPT_DIR/venv"

    echo "   🐍 Python virtual environment ready"
}

# Main installation process
echo "Starting complete installation..."
echo ""

# Install everything
setup_user_groups
create_eglfs_config
setup_python_environment
install_scripts
setup_systemd
configure_boot_settings
setup_touch_rotation
hide_mouse_cursor
setup_kiosk_optimizations
setup_console_autologin

echo ""
echo "🎉 Installation Complete!"
echo "========================"
echo ""
echo "📟 Detected: $PI_MODEL"
if [ "$IS_PI5" = true ]; then
    echo "   └─ Using Pi 5 optimized settings (DSI-2, dedicated VRAM)"
fi
echo ""
echo "✅ Python virtual environment created at: $SCRIPT_DIR/venv"
echo "✅ System scripts installed in /usr/local/bin/"
echo "✅ Systemd service configured for auto-start"
echo "✅ Mouse cursor hiding configured (Qt + unclutter)"
echo "✅ Kiosk optimizations applied"
echo "✅ Console auto-login configured"
echo "✅ User groups configured (video, render, input)"
echo "✅ EGLFS display config created"
echo ""
echo "🔧 Service Management:"
echo "   Start now:  sudo systemctl start oryn-touch"
echo "   Stop:       sudo systemctl stop oryn-touch"
echo "   Status:     sudo systemctl status oryn-touch"
echo "   Logs:       sudo journalctl -u oryn-touch -f"
echo ""
echo "💡 To start the service now without rebooting:"
echo "   sudo systemctl start oryn-touch"
echo ""
echo "🛠️  For development/testing (run manually):"
echo "   cd $SCRIPT_DIR"
echo "   ./run.sh"
echo ""
echo "⚙️  To change boot/login settings later:"
echo "   sudo ./configure-boot.sh"
echo ""

# Ask if user wants to start now
read -p "🤔 Would you like to start the service now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting ORYN Touch service..."
    systemctl start oryn-touch
    sleep 2
    systemctl status oryn-touch --no-pager -l
    echo ""
    echo "✅ Service started! Check the status above."
fi

echo ""
echo "🚀 Next Steps:"
echo "   1. ⚠️  REBOOT REQUIRED for config.txt changes to take effect"
echo "   2. After reboot, the app will start automatically on boot via systemd service"
echo "   3. Check the logs if you encounter any issues: sudo journalctl -u oryn-touch -f"
echo ""
echo "🎯 Installation completed successfully!"