#!/bin/bash
# Install Talus Tally icon for desktop integration (launcher and taskbar)
# This script should be run as root during .deb postinst or manually after install

set -e

ICON_SRC_PNG="/opt/talus_tally/frontend/src-tauri/icons/TalusTallyIcon.png"
ICON_SRC_SVG="/opt/talus_tally/assets/icons/TalusTallyIcon.svg"
ICON_NAME="talus-tally.png"
ICON_SIZES=(16 32 48 64 128 256)

# Ensure ImageMagick is installed for convert
if ! command -v convert >/dev/null 2>&1; then
    echo "ImageMagick 'convert' is required for icon resizing. Please install it." >&2
    exit 1
fi

# Install SVG to scalable icons
install -Dm644 "$ICON_SRC_SVG" "/usr/share/icons/hicolor/scalable/apps/talus-tally.svg"

# Install PNG icons at all required sizes
for SIZE in "${ICON_SIZES[@]}"; do
    DST="/usr/share/icons/hicolor/${SIZE}x${SIZE}/apps/$ICON_NAME"
    mkdir -p "$(dirname "$DST")"
    convert "$ICON_SRC_PNG" -resize ${SIZE}x${SIZE} "$DST"
    echo "Installed $DST"
    gtk-update-icon-cache -f "/usr/share/icons/hicolor" || true
done

# Legacy pixmaps (for taskbar)
install -Dm644 "$ICON_SRC_PNG" "/usr/share/pixmaps/$ICON_NAME"

# Update icon cache again
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f /usr/share/icons/hicolor || true
fi

# Ensure Tauri uses the correct icon for Linux builds
if [ ! -f /opt/talus_tally/frontend/src-tauri/icons/TalusTallyIcon.png ]; then
    echo "ERROR: /opt/talus_tally/frontend/src-tauri/icons/TalusTallyIcon.png not found."
    echo "Make sure this file is present in your .deb and installed to the correct location."
    exit 1
fi


# Ensure icon.png is your real app icon for Tauri build
cp /opt/talus_tally/frontend/src-tauri/icons/TalusTallyIcon.png /opt/talus_tally/frontend/src-tauri/icons/icon.png

echo "Talus Tally icon installed to all required locations."
