#!/bin/bash
# Install ORYN Touch scripts to system locations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (use sudo)"
    echo "   These scripts need to be installed in /usr/local/bin/ with proper permissions"
    exit 1
fi

echo "🔧 Installing ORYN Touch system scripts..."
echo ""

# Function to install a script
install_script() {
    local script_name="$1"
    local source_path="$SCRIPT_DIR/$script_name"
    local target_path="/usr/local/bin/$script_name"
    
    if [ ! -f "$source_path" ]; then
        echo "❌ Source script not found: $source_path"
        return 1
    fi
    
    echo "📄 Installing $script_name..."
    
    # Copy script
    cp "$source_path" "$target_path"
    
    # Set proper permissions (executable by root, readable by all)
    chmod 755 "$target_path"
    chown root:root "$target_path"
    
    echo "   ✅ Installed: $target_path"
}

# Install all scripts
install_script "screen-on"
install_script "screen-off" 
install_script "touch-monitor"

echo ""
echo "🎯 All scripts installed successfully!"
echo ""
echo "Installed scripts:"
echo "   /usr/local/bin/screen-on     - Turn display on"
echo "   /usr/local/bin/screen-off    - Turn display off"  
echo "   /usr/local/bin/touch-monitor - Monitor touch input"
echo ""
echo "Test the scripts:"
echo "   sudo /usr/local/bin/screen-off"
echo "   sudo /usr/local/bin/screen-on"
echo ""
echo "⚠️  Note: The touch-monitor script is disabled by default in the app"
echo "   due to sensitivity issues. Direct touch monitoring is used instead."