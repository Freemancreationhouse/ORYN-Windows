#!/bin/bash
#
# ORYN Raspberry Pi Setup Script
#
# ONE-COMMAND INSTALL (recommended):
#   curl -fsSL https://raw.githubusercontent.com/Freemancreationhouse/ORYN/main/setup-pi.sh | bash
#
# OR from existing clone:
#   git clone https://github.com/Freemancreationhouse/ORYN.git ~/oryn
#   cd ~/oryn
#   bash setup-pi.sh
#
# Options:
#   --no-wifi-fix   Skip WiFi stability fix
#   --no-hotspot    Skip autohotspot setup
#   --help          Show help
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
FIX_WIFI=true  # Applied by default for stability
SETUP_HOTSPOT=true  # Autohotspot for first-time WiFi setup
CONNECTION_MODE="${ORYN_CONNECTION_MODE:-usb}"   # usb | uart
AUTO_REBOOT=false
NONINTERACTIVE=false

# curl | bash does not have an interactive terminal. Use safe defaults.
if [[ ! -t 0 ]]; then
    NONINTERACTIVE=true
fi
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME="$(eval echo ~"$REAL_USER")"
# Fallback: if tilde didn't expand, read from /etc/passwd
if [[ "$REAL_HOME" == "~$REAL_USER" ]]; then
    REAL_HOME="$(grep "^$REAL_USER:" /etc/passwd | cut -d: -f6)"
fi
INSTALL_DIR="$REAL_HOME/oryn"
REPO_URL="${ORYN_REPO_URL:-https://github.com/Freemancreationhouse/ORYN.git}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-wifi-fix)
            FIX_WIFI=false
            shift
            ;;
        --no-hotspot)
            SETUP_HOTSPOT=false
            shift
            ;;
        --usb)
            CONNECTION_MODE="usb"
            shift
            ;;
        --uart)
            CONNECTION_MODE="uart"
            shift
            ;;
        --reboot)
            AUTO_REBOOT=true
            shift
            ;;
        --help|-h)
            echo "ORYN Raspberry Pi Setup Script"
            echo ""
            echo "One-command install:"
            echo "  curl -fsSL https://raw.githubusercontent.com/Freemancreationhouse/ORYN/main/setup-pi.sh | bash"
            echo ""
            echo "Or from existing clone:"
            echo "  cd ~/oryn && bash setup-pi.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --usb            Use USB controller connection (default)"
            echo "  --uart           Configure Raspberry Pi UART for GPIO TX/RX"
            echo "  --no-wifi-fix    Skip WiFi stability fix"
            echo "  --no-hotspot     Skip autohotspot setup"
            echo "  --reboot         Reboot automatically if setup requires it"
            echo "  --help, -h       Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# ── Permission helpers ──────────────────────────────────────────────
# Run a command as the real (non-root) user.
# When the script is invoked with sudo, commands like git clone, pip install,
# and venv creation should run as the real user so files are owned correctly
# from the start — no chown needed afterward.
run_as_user() {
    if [[ $EUID -eq 0 && -n "$SUDO_USER" ]]; then
        sudo -u "$SUDO_USER" -- "$@"
    else
        "$@"
    fi
}

# Ensure the entire repo tree is owned by the real user.
# Call this as a safety net after any operation that may have created
# files as root (e.g. an older version of this script, or a plugin).
fix_repo_ownership() {
    if [[ $EUID -eq 0 && -n "$SUDO_USER" ]]; then
        chown -R "$SUDO_USER:$SUDO_USER" "$INSTALL_DIR"
    fi
}
# ────────────────────────────────────────────────────────────────────

# Helper functions
print_step() {
    echo -e "\n${BLUE}==>${NC} ${GREEN}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}Warning:${NC} $1"
}

print_error() {
    echo -e "${RED}Error:${NC} $1"
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

# Install system dependencies
install_system_deps() {
    print_step "Installing system dependencies..."
    sudo apt update
    sudo DEBIAN_FRONTEND=noninteractive apt install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
        python3-venv python3-pip python3-dev \
        gcc g++ make swig unzip wget \
        libjpeg-dev zlib1g-dev \
        libgpiod-dev gpiod \
        nginx git vim
    print_success "System dependencies installed"
}

# Ensure lgpio C library is available for pip to build against
install_lgpio() {
    local syslib="/usr/lib/aarch64-linux-gnu"

    # Raspberry Pi OS Trixie ships liblgpio.so.1 but no unversioned
    # liblgpio.so symlink (normally provided by a -dev package).
    # The build-time linker needs the unversioned name (-llgpio → liblgpio.so).
    if [[ ! -e "$syslib/liblgpio.so" ]]; then
        # Check if the versioned library exists (from Pi OS)
        local versioned
        versioned=$(ls "$syslib"/liblgpio.so.* 2>/dev/null | head -1)

        if [[ -n "$versioned" ]]; then
            print_step "Creating liblgpio.so build symlink..."
            sudo ln -sf "$versioned" "$syslib/liblgpio.so"
            sudo ldconfig
            print_success "liblgpio.so symlink created (-> $(basename "$versioned"))"
        else
            # Not in system paths — build from source
            print_step "Building lgpio C library from source..."
            local tmpdir
            tmpdir=$(mktemp -d)
            cd "$tmpdir"
            wget -q https://github.com/joan2937/lg/archive/master.zip
            unzip -q master.zip
            cd lg-master
            make
            sudo make install
            cd /
            rm -rf "$tmpdir"
            # Symlink from /usr/local/lib into system path
            if [[ -f /usr/local/lib/liblgpio.so ]]; then
                sudo ln -sf /usr/local/lib/liblgpio.so "$syslib/liblgpio.so"
            fi
            sudo ldconfig
            print_success "lgpio C library built and installed"
        fi
    else
        echo "liblgpio.so already available for linking"
    fi
}

# Check if running on Raspberry Pi
check_raspberry_pi() {
    print_step "Checking system compatibility..."

    if [[ ! -f /proc/device-tree/model ]]; then
        print_warning "Could not detect Raspberry Pi model. Continuing anyway..."
        return
    fi

    MODEL=$(tr -d '\0' < /proc/device-tree/model)
    echo "Detected: $MODEL"

    # Check for 64-bit OS
    ARCH=$(uname -m)
    if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
        print_error "64-bit OS required. Detected: $ARCH"
        echo "Please reinstall Raspberry Pi OS (64-bit) using Raspberry Pi Imager"
        exit 1
    fi
    print_success "64-bit OS detected ($ARCH)"
}

# Disable WLAN power save
disable_wlan_powersave() {
    print_step "Disabling WLAN power save for better stability..."

    # Check if already disabled
    if iwconfig wlan0 2>/dev/null | grep -q "Power Management:off"; then
        echo "WLAN power save already disabled"
        return
    fi

    # Create config to persist across reboots
    sudo tee /etc/NetworkManager/conf.d/wifi-powersave-off.conf > /dev/null << 'EOF'
[connection]
wifi.powersave = 2
EOF

    # Also try immediate disable
    sudo iwconfig wlan0 power off 2>/dev/null || true

    print_success "WLAN power save disabled"
}

# Apply WiFi stability fix
apply_wifi_fix() {
    print_step "Applying WiFi stability fix..."

    CMDLINE_FILE="/boot/firmware/cmdline.txt"
    if [[ ! -f "$CMDLINE_FILE" ]]; then
        CMDLINE_FILE="/boot/cmdline.txt"
    fi

    if [[ ! -f "$CMDLINE_FILE" ]]; then
        print_warning "Could not find cmdline.txt, skipping WiFi fix"
        return
    fi

    # Check if fix already applied
    if grep -q "brcmfmac.feature_disable=0x82000" "$CMDLINE_FILE"; then
        echo "WiFi fix already applied"
        return
    fi

    # Backup and apply fix
    sudo cp "$CMDLINE_FILE" "${CMDLINE_FILE}.backup"
    sudo sed -i 's/$/ brcmfmac.feature_disable=0x82000/' "$CMDLINE_FILE"

    print_success "WiFi fix applied. A reboot is recommended after setup."
    NEEDS_REBOOT=true
}

# Verify we're in the oryn directory
ensure_repo() {
    print_step "Setting up oryn repository..."

    # Check if we're already in the oryn directory
    if [[ -f "main.py" ]] && [[ -f "requirements.txt" ]]; then
        INSTALL_DIR="$(pwd)"
        print_success "Using existing repo at $INSTALL_DIR"
        fix_repo_ownership
        return
    fi

    # Check if repo exists in home directory
    if [[ -d "$INSTALL_DIR" ]] && [[ -f "$INSTALL_DIR/main.py" ]]; then
        print_success "Found existing repo at $INSTALL_DIR"
        cd "$INSTALL_DIR"
        echo "Pulling latest changes..."
        run_as_user git pull
        fix_repo_ownership
        return
    fi

    # Clone the repository as the real user so files are owned correctly
    print_step "Cloning oryn repository..."
    run_as_user git clone "$REPO_URL" --single-branch "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    print_success "Cloned to $INSTALL_DIR"
}

# Deploy native (venv + systemd + nginx)
deploy_native() {
    print_step "Setting up Python virtual environment..."

    cd "$INSTALL_DIR"

    # Safety net: fix ownership in case repo was cloned/pulled as root
    # by an older version of this script or manual sudo git operations
    fix_repo_ownership

    # Create venv as real user
    run_as_user python3 -m venv .venv
    source .venv/bin/activate

    # Install dependencies as real user (pip writes to user-owned .venv)
    print_step "Installing Python packages..."
    run_as_user .venv/bin/pip install --upgrade pip

    # Raspberry Pi Zero 2 W uses the standard Blinka/NeoPixel backend.
    # The Pi-5-only PIO package is intentionally excluded on Zero 2 W so a
    # clean GitHub install cannot fail on an incompatible hardware package.
    local requirements_file="requirements.txt"
    if [[ -r /proc/device-tree/model ]]; then
        local detected_model
        detected_model=$(tr -d '\0' < /proc/device-tree/model)
        if [[ "$detected_model" == *"Raspberry Pi Zero 2 W"* ]] && [[ -f "$INSTALL_DIR/requirements-pi-zero2.txt" ]]; then
            requirements_file="requirements-pi-zero2.txt"
        fi
    fi
    echo "Using Python requirements: $requirements_file"
    run_as_user .venv/bin/pip install -r "$requirements_file"

    # Ensure nginx (www-data) can traverse to static files
    # chmod o+x grants traversal only, not directory listing
    local dir="$INSTALL_DIR"
    while [[ "$dir" != "/" ]]; do
        sudo chmod o+x "$dir"
        dir=$(dirname "$dir")
    done

    # Configure nginx
    print_step "Configuring nginx..."
    sudo cp "$INSTALL_DIR/nginx/oryn.conf" /etc/nginx/sites-available/oryn.conf
    sudo sed -i "s|INSTALL_DIR_PLACEHOLDER|$INSTALL_DIR|g" /etc/nginx/sites-available/oryn.conf
    sudo ln -sf /etc/nginx/sites-available/oryn.conf /etc/nginx/sites-enabled/oryn.conf
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t
    sudo systemctl restart nginx
    sudo systemctl enable nginx

    # Create systemd service
    print_step "Creating systemd service..."
    sudo cp "$INSTALL_DIR/oryn.service" /etc/systemd/system/oryn.service
    sudo sed -i "s|INSTALL_DIR_PLACEHOLDER|$INSTALL_DIR|g" /etc/systemd/system/oryn.service

    # Enable and start service
    sudo systemctl daemon-reload
    sudo systemctl enable oryn
    sudo systemctl start oryn

    # Create sudoers entry for passwordless systemctl commands
    # Use REAL_USER (not $USER which is root under sudo)
    print_step "Configuring sudo permissions..."
    sudo tee /etc/sudoers.d/oryn > /dev/null << EOF
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart oryn
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop oryn
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl start oryn
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl poweroff
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx
EOF
    sudo chmod 0440 /etc/sudoers.d/oryn

    print_success "Native deployment complete!"
}

# Install dw CLI command
install_cli() {
    print_step "Installing 'oryn' command..."

    # Copy dw script to /usr/local/bin
    sudo cp "$INSTALL_DIR/oryn" /usr/local/bin/oryn
    sudo chmod +x /usr/local/bin/oryn

    print_success "'oryn' command installed"
}

# Setup autohotspot
setup_autohotspot() {
    print_step "Setting up autohotspot..."

    if [[ ! -f "$INSTALL_DIR/wifi/setup-wifi.sh" ]]; then
        print_warning "wifi/setup-wifi.sh not found, skipping autohotspot setup"
        return
    fi

    bash "$INSTALL_DIR/wifi/setup-wifi.sh"
    print_success "Autohotspot setup complete"
}

# Configure UART for GPIO pin connection to DLC32/ESP32
configure_uart() {
    local CONFIG_FILE="/boot/firmware/config.txt"
    if [[ ! -f "$CONFIG_FILE" ]]; then
        CONFIG_FILE="/boot/config.txt"
    fi

    # Interactive local execution may ask; curl|bash defaults to USB.
    if [[ "$NONINTERACTIVE" != "true" && -t 0 ]]; then
        echo ""
        echo -e "${GREEN}Controller connection:${NC}"
        echo "  1) USB cable"
        echo "  2) UART over GPIO TX/RX"
        echo ""
        local choice
        read -p "Enter choice [1/2] (default: 1): " -r choice
        if [[ "$choice" == "2" ]]; then
            CONNECTION_MODE="uart"
        else
            CONNECTION_MODE="usb"
        fi
    fi

    if [[ "$CONNECTION_MODE" == "uart" ]]; then
        print_step "Configuring Raspberry Pi UART..."

        if command -v raspi-config &>/dev/null; then
            # Disable Linux login shell on serial; enable serial hardware.
            sudo raspi-config nonint do_serial 2 || true
        fi

        for overlay in "dtoverlay=pi3-miniuart-bt" "dtoverlay=miniuart-bt" "enable_uart=1"; do
            if ! grep -q "^${overlay}$" "$CONFIG_FILE" 2>/dev/null; then
                echo "$overlay" | sudo tee -a "$CONFIG_FILE" >/dev/null
            fi
        done

        NEEDS_REBOOT=true
        print_success "UART configured"
    else
        echo "USB controller mode selected"
    fi
}

# Remove software that is no longer needed on the Pi
cleanup_unused() {
    print_step "Cleaning up unused software..."

    # Remove Node.js / npm if present from a prior install
    if dpkg -l nodejs 2>/dev/null | grep -q '^ii'; then
        echo "Removing Node.js (no longer needed — frontend is pre-built)..."
        sudo apt purge -y nodejs || true
        sudo rm -f /etc/apt/sources.list.d/nodesource.list \
                    /etc/apt/keyrings/nodesource.gpg 2>/dev/null || true
        sudo apt autoremove -y
        print_success "Node.js removed"
    fi

    # Remove Docker if present from old Docker-based deployment
    if dpkg -l docker-ce 2>/dev/null | grep -q '^ii'; then
        echo "Removing Docker (old deployment method)..."
        # Stop running containers
        sudo docker stop $(sudo docker ps -aq) 2>/dev/null || true
        sudo apt purge -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || true
        sudo rm -rf /var/lib/docker
        sudo apt autoremove -y
        print_success "Docker removed"
    fi
}

# Get IP address
get_ip_address() {
    # Try multiple methods to get IP
    IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [[ -z "$IP" ]]; then
        IP=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -1)
    fi
    if [[ -z "$IP" ]]; then
        IP="<your-pi-ip>"
    fi
    echo "$IP"
}

# Print final instructions
print_final_instructions() {
    IP=$(get_ip_address)
    HOSTNAME=$(hostname)

    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}   ORYN Setup Complete!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "Access the web interface at:"
    echo -e "  ${BLUE}http://$IP${NC}"
    echo -e "  ${BLUE}http://$HOSTNAME.local${NC}"
    echo ""

    echo "Manage with the 'oryn' command:"
    echo "  oryn logs        View live logs"
    echo "  oryn restart     Restart ORYN"
    echo "  oryn update      Pull latest and restart"
    echo "  oryn stop        Stop ORYN"
    echo "  oryn status      Show status"
    echo "  oryn wifi help   WiFi and hotspot management"
    echo "  oryn help        Show all commands"
    echo ""

    if [[ "$SETUP_HOTSPOT" == "true" ]]; then
        echo -e "${BLUE}Autohotspot:${NC} If no known WiFi is found on boot,"
        echo "a 'ORYN' hotspot will be created automatically."
        echo "Connect to it and open the app to configure WiFi."
        echo ""
    fi

    if [[ "$NEEDS_REBOOT" == "true" ]]; then
        print_warning "A reboot is required to apply configuration changes"
        if [[ "$AUTO_REBOOT" == "true" ]]; then
            echo "Rebooting now..."
            sudo reboot
        elif [[ "$NONINTERACTIVE" == "true" ]]; then
            echo "Run: sudo reboot"
        else
            read -p "Reboot now? (y/N) " -r REPLY
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                sudo reboot
            fi
        fi
    fi
}

# Main installation flow
main() {
    echo -e "${GREEN}"
    echo "=========================================="
    echo "   Studio Kinematics — ORYN"
    echo "   Raspberry Pi Installer"
    echo "=========================================="
    echo -e "${NC}"
    echo "Raspberry Pi Setup Script"
    echo ""
    echo "Install directory: $INSTALL_DIR"
    echo ""

    # Ask connection type upfront (before long-running installs)
    configure_uart

    # Run setup steps
    check_raspberry_pi
    install_system_deps
    ensure_repo
    disable_wlan_powersave

    if [[ "$FIX_WIFI" == "true" ]]; then
        apply_wifi_fix
    fi

    if [[ "$SETUP_HOTSPOT" == "true" ]]; then
        setup_autohotspot
    fi

    install_lgpio
    deploy_native
    install_cli
    cleanup_unused
    print_final_instructions
}

# Run main
main
