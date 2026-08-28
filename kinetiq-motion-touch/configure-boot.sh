#!/bin/bash
# Configure boot and session options for ORYN Touch

set -e

if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (use sudo)"
    exit 1
fi

ACTUAL_USER="${SUDO_USER:-$USER}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔧 ORYN Touch - Boot Configuration"
echo "=========================================="
echo "Current user: $ACTUAL_USER"
echo ""

show_current_config() {
    echo "📊 Current Configuration:"
    
    # Check auto-login status
    if [ -f /etc/lightdm/lightdm.conf.d/60-autologin.conf ]; then
        echo "   ✅ Auto-login: Enabled (lightdm)"
    elif grep -q "autologin-user=" /etc/lightdm/lightdm.conf 2>/dev/null; then
        echo "   ✅ Auto-login: Enabled (lightdm main config)"
    elif [ -f /etc/systemd/system/getty@tty1.service.d/override.conf ]; then
        echo "   ✅ Auto-login: Enabled (systemd)"
    else
        echo "   ❌ Auto-login: Disabled"
    fi
    
    # Check service status
    if systemctl is-enabled oryn-touch >/dev/null 2>&1; then
        echo "   ✅ Service: Enabled (starts on boot)"
    else
        echo "   ❌ Service: Disabled"
    fi
    
    # Check kiosk session
    if [ -f /usr/share/xsessions/oryn-kiosk.session ]; then
        echo "   ✅ Kiosk Session: Available"
    else
        echo "   ❌ Kiosk Session: Not installed"
    fi
    
    echo ""
}

enable_auto_login() {
    echo "🔑 Enabling auto-login..."
    
    if [ -d /etc/lightdm ]; then
        mkdir -p /etc/lightdm/lightdm.conf.d
        cat > /etc/lightdm/lightdm.conf.d/60-autologin.conf << EOF
[Seat:*]
autologin-user=$ACTUAL_USER
autologin-user-timeout=0
user-session=LXDE-pi
EOF
        echo "   ✅ lightdm auto-login enabled"
    else
        # Fallback to systemd
        mkdir -p /etc/systemd/system/getty@tty1.service.d
        cat > /etc/systemd/system/getty@tty1.service.d/override.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $ACTUAL_USER --noclear %I \$TERM
EOF
        systemctl daemon-reload
        echo "   ✅ systemd auto-login enabled"
    fi
}

disable_auto_login() {
    echo "🔑 Disabling auto-login..."
    
    # Remove lightdm auto-login configs
    rm -f /etc/lightdm/lightdm.conf.d/60-autologin.conf
    
    if [ -f /etc/lightdm/lightdm.conf ]; then
        sed -i "s/^autologin-user=.*/#autologin-user=/" /etc/lightdm/lightdm.conf
    fi
    
    # Remove systemd auto-login
    rm -rf /etc/systemd/system/getty@tty1.service.d
    systemctl daemon-reload
    
    echo "   ✅ Auto-login disabled"
}

enable_service() {
    echo "🚀 Enabling ORYN service..."
    systemctl enable oryn-touch.service
    echo "   ✅ Service will start on boot"
}

disable_service() {
    echo "🚀 Disabling ORYN service..."
    systemctl disable oryn-touch.service
    systemctl stop oryn-touch.service 2>/dev/null || true
    echo "   ✅ Service disabled"
}

# Show current status
show_current_config

# Main menu
echo "Choose configuration:"
echo "1) Full Kiosk Mode (auto-login + service enabled)"
echo "2) Service Only (manual login, auto-start service)"  
echo "3) Manual Mode (manual login, manual start)"
echo "4) Toggle auto-login only"
echo "5) Toggle service only"
echo "6) Show current status"
echo "7) Exit"
echo ""
read -p "Enter your choice (1-7): " choice

case $choice in
    1)
        enable_auto_login
        enable_service
        echo ""
        echo "🎯 Full kiosk mode enabled!"
        echo "   Reboot to see the changes"
        ;;
    2)
        disable_auto_login
        enable_service
        echo ""
        echo "🔧 Service-only mode enabled!"
        echo "   Manual login required, but service starts automatically"
        ;;
    3)
        disable_auto_login
        disable_service
        echo ""
        echo "🛠️  Manual mode enabled!"
        echo "   Manual login and manual service start required"
        ;;
    4)
        if [ -f /etc/lightdm/lightdm.conf.d/60-autologin.conf ] || [ -f /etc/systemd/system/getty@tty1.service.d/override.conf ]; then
            disable_auto_login
        else
            enable_auto_login
        fi
        ;;
    5)
        if systemctl is-enabled oryn-touch >/dev/null 2>&1; then
            disable_service
        else
            enable_service
        fi
        ;;
    6)
        show_current_config
        ;;
    7)
        echo "👋 Exiting..."
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Configuration updated!"