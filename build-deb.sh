#!/bin/bash
# Script to create a .deb package for Talus Tally

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "🔨 Building Tauri application..."
cd frontend
npm run desktop:build || true  # Allow AppImage bundling to fail
cd ..

echo "📦 Creating Debian package structure..."

# Create package directory
PACKAGE_DIR="talus-tally_0.1.0_amd64"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/DEBIAN"
mkdir -p "$PACKAGE_DIR/usr/bin"
mkdir -p "$PACKAGE_DIR/usr/share/applications"
mkdir -p "$PACKAGE_DIR/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$PACKAGE_DIR/opt/talus-tally"

# Build Python virtual environment with all dependencies pre-compiled
echo "🐍 Building Python virtual environment with dependencies..."
rm -rf /tmp/talus-tally-venv
python3 -m venv /tmp/talus-tally-venv
. /tmp/talus-tally-venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
deactivate

# Copy pre-built venv into package
cp -r /tmp/talus-tally-venv "$PACKAGE_DIR/opt/talus-tally/venv"
rm -rf /tmp/talus-tally-venv

# Copy control files
cp debian/control "$PACKAGE_DIR/DEBIAN/"
cp debian/changelog "$PACKAGE_DIR/DEBIAN/changelog"
gzip -9 "$PACKAGE_DIR/DEBIAN/changelog"

# Set permissions
chmod 755 "$PACKAGE_DIR/DEBIAN"

# Create postinst script (venv is pre-included)
cat > "$PACKAGE_DIR/DEBIAN/postinst" << 'EOF'
#!/bin/bash
set -e

# Ensure proper permissions on venv
if [ -d /opt/talus-tally/venv ]; then
    chmod -R 755 /opt/talus-tally/venv
fi

# Ensure binary is executable
if [ -f /usr/bin/talus-tally ]; then
    chmod 755 /usr/bin/talus-tally
fi

# Update desktop database so launcher appears
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database /usr/share/applications || true
fi

echo "Talus Tally installed successfully!"
EOF
chmod 755 "$PACKAGE_DIR/DEBIAN/postinst"

# Copy binary (from Tauri build)
if [ -f "frontend/src-tauri/target/release/app" ]; then
    cp "frontend/src-tauri/target/release/app" "$PACKAGE_DIR/usr/bin/talus-tally"
    chmod 755 "$PACKAGE_DIR/usr/bin/talus-tally"
else
    echo "⚠️  Warning: Tauri binary not found at frontend/src-tauri/target/release/app"
    # Create a placeholder that will fail gracefully
    cat > "$PACKAGE_DIR/usr/bin/talus-tally" << 'EOF'
#!/bin/bash
echo "Error: Talus Tally binary not properly installed"
exit 1
EOF
    chmod 755 "$PACKAGE_DIR/usr/bin/talus-tally"
fi

# Copy backend
cp -r backend "$PACKAGE_DIR/opt/talus-tally/"
cp -r assets "$PACKAGE_DIR/opt/talus-tally/" 2>/dev/null || true
cp -r data "$PACKAGE_DIR/opt/talus-tally/" 2>/dev/null || true
cp requirements.txt "$PACKAGE_DIR/opt/talus-tally/"

# Copy desktop entry
cp debian/talus-tally.desktop "$PACKAGE_DIR/usr/share/applications/"

# Copy icon if available
if [ -f "assets/icons/TalusTallyIcon.png" ]; then
    cp "assets/icons/TalusTallyIcon.png" "$PACKAGE_DIR/usr/share/icons/hicolor/256x256/apps/talus-tally.png"
elif [ -f "assets/icons/icon.png" ]; then
    cp "assets/icons/icon.png" "$PACKAGE_DIR/usr/share/icons/hicolor/256x256/apps/talus-tally.png"
fi

# Copy scalable SVG icon if available
if [ -f "assets/icons/TalusTallyIcon.svg" ]; then
    mkdir -p "$PACKAGE_DIR/usr/share/icons/hicolor/scalable/apps"
    cp "assets/icons/TalusTallyIcon.svg" "$PACKAGE_DIR/usr/share/icons/hicolor/scalable/apps/talus-tally.svg"
fi

# Build the package
echo "📦 Building .deb package..."
dpkg-deb --build "$PACKAGE_DIR"

echo "✅ Package created: $PACKAGE_DIR.deb"
ls -lh "$PACKAGE_DIR.deb"
